using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Animation;
using CUE4Parse.UE4.Assets.Exports.Material;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;

// The in-browser extractor (docs/WEBSITE-PLAN.md, Phase 6). Runs in a module Web
// Worker (src/extract/extractor.worker.ts), which hands over the game's pak as a
// File; every read goes back to the worker through readRange(), so only the
// bytes asked for ever leave the disk. Lessons from the spike (learning page,
// Chapters 10 and 13) are kept as comments where they apply.
[assembly: System.Runtime.Versioning.SupportedOSPlatform("browser")]

Console.WriteLine("PalDoc extractor: runtime started");

public static partial class Extractor
{
    static StreamedFileProvider? provider;

    /// <summary>What is running, for the page's log and bug reports.</summary>
    [JSExport]
    public static string Version() => Json(new()
    {
        ["cue4parse"] = typeof(StreamedFileProvider).Assembly.GetName().Version?.ToString() ?? "?",
        ["runtime"] = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
    });

    /// <summary>
    /// Mount the pak the worker holds. Async on purpose: CUE4Parse's SubmitKey() blocks
    /// on its async version (Task.Result), and the browser's one thread can't block
    /// (".NET: Cannot wait on monitors on this runtime"). Awaiting yields instead.
    /// </summary>
    [JSExport]
    public static async Task<string> Mount(string pakName, double pakSize)
    {
        var sw = Stopwatch.StartNew();
        JsFileStream.Reads = 0;
        JsFileStream.BytesRead = 0;
        provider = new StreamedFileProvider("Palworld", new VersionContainer(EGame.GAME_UE5_1), StringComparer.OrdinalIgnoreCase);
        provider.Initialize();
        provider.RegisterVfs(pakName, [new JsFileStream((long)pakSize)], null);
        // The pak is not encrypted, but the provider still wants a key for the null GUID.
        await provider.SubmitKeyAsync(new FGuid(), new FAesKey(new byte[32]));
        await provider.MountAsync();
        var pals = provider.Files.Keys.Count(k => k.Contains("/Model/Character/Monster/") && Path.GetFileName(k).StartsWith("SK_") && k.EndsWith(".uasset"));
        return Json(new()
        {
            ["files"] = provider.Files.Count,
            ["palMeshes"] = pals,
            ["mountMs"] = sw.ElapsedMilliseconds,
            ["reads"] = JsFileStream.Reads,
            ["bytesRead"] = JsFileStream.BytesRead,
        });
    }

    /// <summary>
    /// Use these mappings, and check they decode the art: Lamball's mesh, every one of
    /// its materials' parameters, and its Idle animation. Returns "" when they work,
    /// else a plain reason. The 7 Oct experiment (WEBSITE-PLAN, Phase 6) found these
    /// are what a wrong file breaks for the art, while tables are no guide: they need
    /// the exact file even when the art doesn't.
    /// </summary>
    [JSExport]
    public static string UseMappings(byte[] usmap)
    {
        if (provider is null) return "The game files aren't open yet.";
        try { provider.MappingsContainer = new BytesUsmapProvider(usmap); }
        catch (Exception e) { return $"The mappings file couldn't be read ({e.GetType().Name}: {e.Message})."; }

        var mesh = Find("/SK_SheepBall.uasset");
        var idle = Find("/AS_SheepBall_Idle.uasset");
        if (mesh is null || idle is null) return "Lamball's model isn't in these game files, so the mappings can't be checked.";
        try
        {
            var m = provider.LoadPackageObject<USkeletalMesh>(mesh);
            if ((m.LODModels?.FirstOrDefault()?.NumVertices ?? 0) == 0) return "Lamball's mesh came back empty.";
            var parameters = 0;
            foreach (var slot in m.Materials)
            {
                var mi = slot?.Load<UMaterialInstanceConstant>();
                parameters += (mi?.TextureParameterValues.Length ?? 0) + (mi?.ScalarParameterValues.Length ?? 0);
            }
            if (parameters == 0) return "Lamball's materials came back empty.";
            var anim = provider.LoadPackageObject<UAnimSequence>(idle);
            if (anim.NumFrames <= 0) return "Lamball's Idle animation came back empty.";
            return "";
        }
        catch (Exception e) { return $"Lamball didn't decode with these mappings ({e.GetType().Name})."; }
    }

    static string? Find(string suffix)
    {
        var key = provider!.Files.Keys.FirstOrDefault(k => k.EndsWith(suffix, StringComparison.OrdinalIgnoreCase));
        return key?[..key.LastIndexOf('.')];
    }

    static string Json(Dictionary<string, object> d) => JsonSerializer.Serialize(d);
}

/// <summary>Mappings from bytes: the stock provider takes a file path, and a browser has none.</summary>
sealed class BytesUsmapProvider : UsmapTypeMappingsProvider
{
    readonly byte[] bytes;
    public BytesUsmapProvider(byte[] bytes) { this.bytes = bytes; Reload(); }
    public override void Reload() => Load(bytes, StringComparer.OrdinalIgnoreCase);
}

/// <summary>
/// A read-only Stream over the pak File the worker holds. Each Read is one
/// synchronous call to readRange() in the worker (file.slice() + FileReaderSync).
/// </summary>
sealed partial class JsFileStream(long length) : Stream
{
    public static long Reads, BytesRead;

    [JSImport("readRange", "extractor")]
    private static partial int ReadRange(double offset, int length, [JSMarshalAs<JSType.MemoryView>] Span<byte> into);

    long position;

    public override int Read(Span<byte> buffer)
    {
        var n = (int)Math.Min(buffer.Length, length - position);
        if (n <= 0) return 0;
        // A double carries the offset: JavaScript numbers count bytes exactly far past 39 GB.
        var got = ReadRange(position, n, buffer[..n]);
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
