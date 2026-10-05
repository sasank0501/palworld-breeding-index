using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;

// Phase 1 spike (docs/WEBSITE-PLAN.md): can CUE4Parse run in a browser?
//   Part 1  Hello()          the runtime starts and CUE4Parse loads
//   Part 2  Mount(), Load()  the 39 GB pak is read through file.slice() and a real
//                            package (Lamball's mesh) decodes: usmap + Oodle work
Console.WriteLine("cue4parse-wasm: runtime started");

public static partial class Spike
{
    static StreamedFileProvider? provider;

    /// <summary>Touch CUE4Parse for real: build a provider and report what the runtime looks like.</summary>
    [JSExport]
    public static string Hello()
    {
        var sw = Stopwatch.StartNew();
        var p = new StreamedFileProvider("Palworld", new VersionContainer(EGame.GAME_UE5_1), StringComparer.OrdinalIgnoreCase);
        var parallelSum = 0;
        Parallel.For(0, 8, i => Interlocked.Add(ref parallelSum, i));
        return string.Join("\n", new[]
        {
            $"CUE4Parse {typeof(StreamedFileProvider).Assembly.GetName().Version}",
            $"provider: {p.GetType().Name}, game {p.Versions.Game}",
            $"runtime: {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription} on {System.Runtime.InteropServices.RuntimeInformation.OSDescription}",
            $"processors: {Environment.ProcessorCount}, Parallel.For sum (want 28): {parallelSum}",
            $"took {sw.ElapsedMilliseconds} ms",
        });
    }

    /// <summary>
    /// Mount the pak the worker holds as a File. Same steps as scripts/pal-textures, with a
    /// stream in place of a folder path and the usmap passed in as bytes.
    /// </summary>
    /// <remarks>
    /// Async on purpose. SubmitKey() and Mount() block on their async versions
    /// (Task.Result), and the browser's single thread can't block: .NET throws
    /// "Cannot wait on monitors on this runtime". Awaiting yields to the event loop instead.
    /// </remarks>
    [JSExport]
    public static async Task<string> Mount(string pakName, double pakSize, byte[] usmap)
    {
        var sw = Stopwatch.StartNew();
        JsFileStream.Reset();
        provider = new StreamedFileProvider("Palworld", new VersionContainer(EGame.GAME_UE5_1), StringComparer.OrdinalIgnoreCase);
        provider.Initialize();
        provider.RegisterVfs(pakName, [new JsFileStream((long)pakSize)], null);
        // Unencrypted, but the provider still wants a key submitted for the null GUID.
        await provider.SubmitKeyAsync(new FGuid(), new FAesKey(new byte[32]));
        await provider.MountAsync();
        var mountMs = sw.ElapsedMilliseconds;
        var mountReads = JsFileStream.Reads;
        var mountBytes = JsFileStream.BytesRead;

        sw.Restart();
        var mappings = new BytesUsmapProvider(usmap);
        provider.MappingsContainer = mappings;
        var usmapMs = sw.ElapsedMilliseconds;

        var sheep = provider.Files.Keys.Where(k => k.Contains("/SheepBall/", StringComparison.OrdinalIgnoreCase)).ToList();
        return Json(new()
        {
            ["mountMs"] = mountMs,
            ["files"] = provider.Files.Count,
            ["mountReads"] = mountReads,
            ["mountBytes"] = mountBytes,
            ["usmapMs"] = usmapMs,
            ["usmapBytes"] = usmap.Length,
            ["lamballFiles"] = sheep.Count,
            ["lamballSample"] = string.Join(" | ", sheep.Where(k => k.EndsWith(".uasset")).Take(6)),
            ["managedHeapMB"] = GC.GetTotalMemory(false) / 1048576,
            ["readLog"] = JsFileStream.Log.ToList(),
        });
    }

    /// <summary>Decode one real package. Needs the usmap (unversioned properties) and Oodle (pak compression).</summary>
    [JSExport]
    public static string LoadMesh(string path)
    {
        if (provider is null) return Json(new() { ["error"] = "mount first" });
        var reads0 = JsFileStream.Reads;
        var bytes0 = JsFileStream.BytesRead;
        var sw = Stopwatch.StartNew();
        try
        {
            var mesh = provider.LoadPackageObject<USkeletalMesh>(path);
            // How the package's files are stored in the pak, to prove Oodle really ran.
            var storage = string.Join(", ", new[] { ".uasset", ".uexp", ".ubulk" }
                .Select(ext => provider.Files.TryGetValue(path + ext, out var f) && f is CUE4Parse.UE4.Pak.Objects.FPakEntry e
                    ? $"{ext} {e.CompressionMethod} {e.CompressedSize:N0}->{e.UncompressedSize:N0} B" : null)
                .Where(x => x != null));
            var lod0 = mesh.LODModels?.FirstOrDefault();
            return Json(new()
            {
                ["loadMs"] = sw.ElapsedMilliseconds,
                ["name"] = mesh.Name,
                ["lods"] = mesh.LODModels?.Length ?? 0,
                ["lod0Vertices"] = lod0?.NumVertices ?? 0,
                ["lod0Sections"] = lod0?.Sections?.Length ?? 0,
                ["bones"] = mesh.ReferenceSkeleton.FinalRefBoneInfo.Length,
                ["materials"] = string.Join(", ", mesh.SkeletalMaterials.Select(m => m.MaterialSlotName.Text)),
                ["storage"] = storage,
                ["reads"] = JsFileStream.Reads - reads0,
                ["readLog"] = JsFileStream.Log.Skip((int)reads0).ToList(),
                ["bytesRead"] = JsFileStream.BytesRead - bytes0,
                ["managedHeapMB"] = GC.GetTotalMemory(false) / 1048576,
            });
        }
        catch (Exception e)
        {
            return Json(new() { ["error"] = e.GetType().Name + ": " + e.Message, ["at"] = e.StackTrace?.Split('\n').Take(6).Aggregate((a, b) => a + "\n" + b) ?? "" });
        }
    }

    static string Json(Dictionary<string, object> d) => System.Text.Json.JsonSerializer.Serialize(d);
}

/// <summary>Usmap mappings from bytes; the stock provider only takes a path.</summary>
sealed class BytesUsmapProvider : UsmapTypeMappingsProvider
{
    readonly byte[] bytes;
    public BytesUsmapProvider(byte[] bytes) { this.bytes = bytes; Reload(); }
    public override void Reload() => Load(bytes, StringComparer.OrdinalIgnoreCase);
}

/// <summary>
/// A read-only Stream over the pak File the worker holds. Every Read becomes one
/// synchronous call to readRange() in main.js, which uses file.slice() and
/// FileReaderSync: only the requested bytes ever leave the disk.
/// </summary>
sealed partial class JsFileStream(long length) : Stream
{
    public static long Reads, BytesRead;
    /// <summary>Where each read landed, for the learning page's map of the pak.</summary>
    public static readonly List<long[]> Log = [];
    public static void Reset() { Reads = 0; BytesRead = 0; Log.Clear(); }

    [JSImport("readRange", "main.js")]
    private static partial int ReadRange(double offset, int length, [JSMarshalAs<JSType.MemoryView>] Span<byte> into);

    long position;

    public override int Read(Span<byte> buffer)
    {
        var n = (int)Math.Min(buffer.Length, length - position);
        if (n <= 0) return 0;
        var got = ReadRange(position, n, buffer[..n]);
        Log.Add([position, got]);
        position += got;
        Reads++;
        BytesRead += got;
        return got;
    }

    public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));

    public override long Seek(long offset, SeekOrigin origin) => position = origin switch
    {
        SeekOrigin.Begin => offset,
        SeekOrigin.Current => position + offset,
        _ => length + offset,
    };

    public override bool CanRead => true;
    public override bool CanSeek => true;
    public override bool CanWrite => false;
    public override long Length => length;
    public override long Position { get => position; set => position = value; }
    public override void Flush() { }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
