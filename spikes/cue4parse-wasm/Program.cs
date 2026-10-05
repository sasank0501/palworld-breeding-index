using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Animation;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;

// Phase 1 spike (docs/WEBSITE-PLAN.md): can CUE4Parse run in a browser?
//   Part 1  Hello()          the runtime starts and CUE4Parse loads
//   Part 2  Mount(), Load()  the 39 GB pak is read through file.slice() and a real
//                            package (Lamball's mesh) decodes: usmap + Oodle work
//   Part 3  ExportPal()      the desktop export (glTF + textures + an animation as
//                            .psa) into .NET's in-memory file system, measured
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

    /// <summary>
    /// The desktop extractor's export (scripts/pal-textures, --mesh and --anim), unchanged
    /// except that the output folder is in .NET's in-memory file system.
    /// </summary>
    [JSExport]
    public static async Task<string> ExportPal(string name, string anim, int maxMip)
    {
        if (provider is null) return Json(new() { ["error"] = "mount first" });
        var result = new Dictionary<string, object> { ["name"] = name };
        var errors = new List<string>();
        var outDir = $"/out/{name}";
        foreach (var f in OutFiles(name)) File.Delete(f.path);
        var reads0 = JsFileStream.Reads;
        var bytes0 = JsFileStream.BytesRead;
        var total = Stopwatch.StartNew();

        var meshPath = provider.Files.Keys.FirstOrDefault(k =>
            k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase) && k.Contains($"/SK_{name}.", StringComparison.OrdinalIgnoreCase));
        if (meshPath is null) return Json(new() { ["error"] = $"No SK_{name}.uasset in the pak" });

        var sw = Stopwatch.StartNew();
        try
        {
            var mesh = provider.LoadPackageObject<USkeletalMesh>(meshPath[..meshPath.LastIndexOf('.')]);
            result["meshLoadMs"] = sw.ElapsedMilliseconds;
            sw.Restart();
            var session = new ExportSession(null!);
            session.Add(mesh);
            var options = new ExportOptions(meshFormat: EMeshFormat.Gltf2, texturePlatform: ETexturePlatform.DesktopMobile, exportMaterials: maxMip >= 0); // maxMip -1: experiment, mesh only
            var res = await session.RunAsync(outDir, options, null, CancellationToken.None);
            // Texture failures here are the SkiaSharp step; the textures are redone below.
            var skia = res.Count(r => !r.Success && r.Error is TypeInitializationException && r.Error.Message.Contains("Skia", StringComparison.Ordinal));
            result["skiaTextureFailures"] = skia;
            errors.AddRange(res.Where(r => !r.Success && !(r.Error is TypeInitializationException && r.Error.Message.Contains("Skia", StringComparison.Ordinal)))
                .Select(r => $"{r.ObjectPath}: {r.Error?.GetType().Name}: {r.Error?.Message}"));
        }
        catch (Exception e) { errors.Add($"mesh: {e.GetType().Name}: {e.Message} @ {e.StackTrace?.Split((char)10).FirstOrDefault()?.Trim()}"); }
        result["meshExportMs"] = sw.ElapsedMilliseconds;

        sw.Restart();
        var animPath = provider.Files.Keys.FirstOrDefault(k => k.EndsWith($"/AS_{name}_{anim}.uasset", StringComparison.OrdinalIgnoreCase));
        if (animPath is null) errors.Add($"No AS_{name}_{anim}.uasset");
        else try
        {
            var seq = provider.LoadPackageObject<UAnimSequence>(animPath[..animPath.LastIndexOf('.')]);
            var session = new ExportSession(null!);
            session.Add(seq);
            var res = await session.RunAsync($"{outDir}/anims", new ExportOptions(meshFormat: EMeshFormat.ActorX), null, CancellationToken.None);
            errors.AddRange(res.Where(r => !r.Success).Select(r => $"{r.ObjectPath}: {r.Error?.GetType().Name}: {r.Error?.Message}"));
        }
        catch (Exception e) { errors.Add($"anim: {e.GetType().Name}: {e.Message} @ {e.StackTrace?.Split((char)10).FirstOrDefault()?.Trim()}"); }
        result["animMs"] = sw.ElapsedMilliseconds;

        // Textures. The export's own PNG step goes through SkiaSharp, a native library
        // the browser doesn't have, so it fails. Decode them here instead (managed
        // AssetRipper decoder) and encode PNGs with ImageSharp, also managed.
        sw.Restart();
        var textures = new List<Dictionary<string, object>>();
        TextureDecoder.UseAssetRipperTextureDecoder = true;
        // Every material JSON the export wrote, by content not by name: some of
        // Pocketpair's are "Ml_" (lowercase L), not "MI_" (Ml_Alpaca_Body, Ml_Ganesha_Eye).
        var texPaths = OutFiles(name).Where(f => f.name.EndsWith(".json"))
            .Select(f => System.Text.Json.JsonDocument.Parse(File.ReadAllText(f.path)).RootElement)
            .Where(j => j.TryGetProperty("Textures", out _))
            .SelectMany(j => j.GetProperty("Textures").EnumerateObject().Select(t => t.Value.GetString()!))
            .Distinct().ToList();
        result["skiaTexturesCovered"] = texPaths.Count;
        foreach (var texPath in texPaths)
        {
            var t0 = Stopwatch.StartNew();
            var texName = texPath[(texPath.LastIndexOf('/') + 1)..texPath.LastIndexOf('.')];
            try
            {
                var tex = provider.LoadPackageObject<UTexture2D>(texPath[..texPath.LastIndexOf('.')]);
                // maxMip > 0: decode the stored mip at that size (a quarter of the pixels at
                // 1024) and skip PNG, as the website pipeline would: it hands raw pixels to
                // the browser's canvas for the WebP the models use.
                var decoded = maxMip > 0
                    ? TextureDecoder.Decode(tex, maxMip, ETexturePlatform.DesktopMobile)
                    : tex.Decode(ETexturePlatform.DesktopMobile);
                if (decoded is null) { errors.Add($"{texName}: decoded to null"); continue; }
                var decodeMs = t0.ElapsedMilliseconds;
                Directory.CreateDirectory($"{outDir}/textures");
                if (maxMip > 0) File.WriteAllBytes($"{outDir}/textures/{texName}.rgba", decoded.Data);
                else File.WriteAllBytes($"{outDir}/textures/{texName}.png", ToPng(decoded));
                textures.Add(new()
                {
                    ["name"] = texName,
                    ["size"] = $"{decoded.Width}x{decoded.Height}",
                    ["format"] = $"{tex.Format} -> {decoded.PixelFormat}",
                    ["decodeMs"] = decodeMs,
                    ["pngMs"] = t0.ElapsedMilliseconds - decodeMs,
                });
            }
            catch (Exception e) { errors.Add($"{texName}: {e.GetType().Name}: {e.Message} @ {e.StackTrace?.Split((char)10).FirstOrDefault()?.Trim()}"); }
        }
        result["texturesMs"] = sw.ElapsedMilliseconds;
        result["textures"] = textures;
        result["totalMs"] = total.ElapsedMilliseconds;
        result["reads"] = JsFileStream.Reads - reads0;
        result["bytesRead"] = JsFileStream.BytesRead - bytes0;
        result["errors"] = errors;
        result["files"] = OutFiles(name).Select(f => new Dictionary<string, object>
        {
            ["file"] = f.name,
            ["bytes"] = new FileInfo(f.path).Length,
            ["sha256"] = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(f.path))).ToLowerInvariant(),
        }).OrderByDescending(d => (long)d["bytes"]).ToList();
        result["managedHeapMB"] = GC.GetTotalMemory(false) / 1048576;
        return Json(result);
    }

    /// <summary>One exported file's bytes, so the page can compare or save it.</summary>
    [JSExport]
    public static byte[] ReadOut(string name, string file) =>
        OutFiles(name).Where(f => f.name == file).Select(f => File.ReadAllBytes(f.path)).FirstOrDefault() ?? [];

    /// <summary>
    /// The files an export wrote. CUE4Parse joins output paths with '\', which on the
    /// browser's Unix-style file system is an ordinary character, not a separator: it
    /// writes "/\out\SheepBall\...\SK_SheepBall.glb" as one file in "/". Accept both.
    /// </summary>
    static IEnumerable<(string path, string name)> OutFiles(string name) =>
        Directory.GetFiles("/", "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true })
            .Select(p => (path: p, norm: p.Replace('\\', '/')))
            .Where(x => x.norm.Contains($"/out/{name}/"))
            .Select(x => (x.path, x.norm[(x.norm.LastIndexOf('/') + 1)..]));

    /// <summary>
    /// Delete a pal's exported files. They live in WebAssembly memory, which never
    /// shrinks, so a full run must hand each pal's files off (to OPFS) and drop them.
    /// </summary>
    [JSExport]
    public static int ClearOut(string name)
    {
        var n = 0;
        foreach (var f in OutFiles(name)) { File.Delete(f.path); n++; }
        return n;
    }

    /// <summary>A decoded texture as PNG, through ImageSharp (managed) instead of SkiaSharp.</summary>
    static byte[] ToPng(CTexture t)
    {
        using var ms = new MemoryStream();
        switch (t.PixelFormat)
        {
            case EPixelFormat.PF_B8G8R8A8: Image.LoadPixelData<Bgra32>(t.Data, t.Width, t.Height).SaveAsPng(ms); break;
            case EPixelFormat.PF_R8G8B8A8: Image.LoadPixelData<Rgba32>(t.Data, t.Width, t.Height).SaveAsPng(ms); break;
            case EPixelFormat.PF_G8: Image.LoadPixelData<L8>(t.Data, t.Width, t.Height).SaveAsPng(ms); break;
            default: throw new NotSupportedException($"pixel format {t.PixelFormat}");
        }
        return ms.ToArray();
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
