using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Animation;
using CUE4Parse.UE4.Assets.Exports.Material;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using System.Text.RegularExpressions;

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
        icons = null;
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

    // ------------------------------------------------------------------ every pal

    static readonly Regex MeshRe = new(@"^Pal/Content/Pal/Model/Character/Monster/[^/]+/SK_([^/]+)\.uasset$", RegexOptions.IgnoreCase);
    static readonly Regex BlueprintRe = new(@"/PalActorBP/[^/]+/BP_([^/]+)\.uasset$", RegexOptions.IgnoreCase);
    /// <summary>Pal name -> mesh package path; animation name -> package path. Built by ListPals.</summary>
    static Dictionary<string, string> meshes = new(StringComparer.OrdinalIgnoreCase);
    static Dictionary<string, string> anims = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Every pal mesh in the pak (any SK_ under Model/Character/Monster/, so no
    /// hand-kept roster), and the Blueprint-only pals that borrow another's mesh.
    /// The same search as scripts/pal-textures --batch.
    /// </summary>
    [JSExport]
    public static string ListPals()
    {
        if (provider is null) return Json(new() { ["error"] = "The game files aren't open yet." });
        meshes = provider.Files.Keys
            .Select(k => (k, m: MeshRe.Match(k)))
            .Where(x => x.m.Success)
            .GroupBy(x => x.m.Groups[1].Value, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().k[..g.First().k.LastIndexOf('.')], StringComparer.OrdinalIgnoreCase);
        anims = provider.Files.Keys
            .Where(k => k.Contains("/Animation/Character/Monster/", StringComparison.OrdinalIgnoreCase) && k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
            .GroupBy(k => Path.GetFileNameWithoutExtension(k), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First()[..g.First().LastIndexOf('.')], StringComparer.OrdinalIgnoreCase);

        // Blueprint-only pals: the mesh they use is in the Blueprint's imports, and
        // the names follow no pattern (Lyleen Noct uses SK_LilyQueen_Ice), so read it.
        var aliases = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in provider.Files.Keys)
        {
            var m = BlueprintRe.Match(key);
            if (!m.Success) continue;
            var pal = m.Groups[1].Value;
            if (meshes.ContainsKey(pal) || pal.Contains("_BOSS") || pal.Contains("_RAID") || pal.Contains("_Skin")) continue;
            try
            {
                if (provider.LoadPackage(key[..key.LastIndexOf('.')]) is not CUE4Parse.UE4.Assets.Package p) continue;
                var sk = p.ImportMap.FirstOrDefault(i => i.ClassName.Text == "SkeletalMesh")?.ObjectName.Text;
                if (sk is not null && sk.StartsWith("SK_") && meshes.ContainsKey(sk[3..])) { aliases[pal] = sk[3..]; continue; }
                // Gumoss (Special) names only a prop: fall back to the parent Blueprint's species.
                var parent = p.ImportMap
                    .Where(i => i.ClassName.Text == "Package" && i.ObjectName.Text.Contains("/PalActorBP/"))
                    .Select(i => i.ObjectName.Text[(i.ObjectName.Text.LastIndexOf("/BP_") + 4)..])
                    .FirstOrDefault(n => meshes.ContainsKey(n));
                if (parent is not null) aliases[pal] = parent;
            }
            catch { /* an unreadable Blueprint just stays unaliased */ }
        }
        return Json(new()
        {
            ["pals"] = meshes.Keys.OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList(),
            ["animations"] = anims.Count,
            ["aliases"] = aliases,
        });
    }

    /// <summary>
    /// One pal, ready for the model builder: the mesh as glTF, each material's
    /// parameters (the same JSON CUE4Parse's material export writes), every texture
    /// those materials name decoded at up to maxEdge pixels, and one animation per
    /// role. Files go to .NET's in-memory file system under /x/{name}/; the worker
    /// reads them out (ReadFile) and frees them (Clear), since WebAssembly memory
    /// never shrinks. Returns JSON describing them.
    /// </summary>
    [JSExport]
    public static async Task<string> ExportPal(string name, string rolesJson, int maxEdge)
    {
        if (provider is null || !meshes.TryGetValue(name, out var meshPath)) return Json(new() { ["error"] = $"No pal called {name} (call ListPals first)." });
        Clear(name);
        var dir = $"/x/{name}";
        var errors = new List<string>();
        var sw = Stopwatch.StartNew();
        var reads0 = JsFileStream.Reads;

        // The mesh. Materials are left out of the export: with them on, the export
        // decodes every texture at full size and then fails (SkiaSharp is native),
        // which was most of the time. Their JSON and textures are made below instead.
        USkeletalMesh? mesh = null;
        try
        {
            mesh = LoadMesh(meshPath);
            var session = new ExportSession(null!);
            session.Add(mesh);
            var res = await session.RunAsync($"{dir}/mesh", new ExportOptions(meshFormat: EMeshFormat.Gltf2, texturePlatform: ETexturePlatform.DesktopMobile, exportMaterials: false), null, CancellationToken.None);
            errors.AddRange(res.Where(r => !r.Success).Select(r => $"mesh: {r.Error?.GetType().Name}: {r.Error?.Message}"));
        }
        catch (Exception e) { errors.Add($"mesh: {e.GetType().Name}: {e.Message}"); }
        var meshMs = sw.ElapsedMilliseconds;

        // Materials and their textures.
        sw.Restart();
        var materials = new Dictionary<string, string>();
        var textures = new List<Dictionary<string, object>>();
        TextureDecoder.UseAssetRipperTextureDecoder = true;
        var depth = new ExportOptions().MaterialDepth;
        var done = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var slot in mesh?.Materials ?? [])
        {
            try
            {
                if (slot is null || !slot.TryLoad<UMaterialInterface>(out var material)) continue;
                var parameters = new CMaterialParams2();
                material.GetParams(parameters, depth);
                // The shape this CUE4Parse's material export writes (the desktop's MI_*.json):
                // each texture parameter's object path, then the parameters themselves.
                var json = new Dictionary<string, object>
                {
                    ["Textures"] = parameters.Textures.ToDictionary(kv => kv.Key, kv => kv.Value.GetPathName()),
                    ["Parameters"] = parameters,
                };
                materials[material.Name] = Newtonsoft.Json.JsonConvert.SerializeObject(json, Newtonsoft.Json.Formatting.Indented);
                foreach (var ptr in parameters.Textures.Values)
                {
                    if (ptr is not UTexture2D tex || !done.Add(tex.Name)) continue;
                    try
                    {
                        var decoded = TextureDecoder.Decode(tex, maxEdge, ETexturePlatform.DesktopMobile);
                        if (decoded is null) { errors.Add($"{tex.Name}: decoded to nothing"); continue; }
                        Directory.CreateDirectory($"{dir}/textures");
                        File.WriteAllBytes($"{dir}/textures/{tex.Name}.raw", decoded.Data);
                        textures.Add(new() { ["name"] = tex.Name, ["width"] = decoded.Width, ["height"] = decoded.Height, ["format"] = decoded.PixelFormat.ToString() });
                    }
                    catch (Exception e) { errors.Add($"{tex.Name}: {e.GetType().Name}: {e.Message}"); }
                }
            }
            catch (Exception e) { errors.Add($"material: {e.GetType().Name}: {e.Message}"); }
        }
        var textureMs = sw.ElapsedMilliseconds;

        // Animations: per role, each candidate in order, the pal's own first, then
        // shorter base names (variants borrow their base species').
        sw.Restart();
        var used = new Dictionary<string, string>();
        var roles = JsonDocument.Parse(rolesJson).RootElement.GetProperty("roles");
        foreach (var r in roles.EnumerateArray())
        {
            var role = r.GetProperty("role").GetString()!;
            string? animPath = null, from = null;
            foreach (var candidate in r.GetProperty("candidates").EnumerateArray().Select(c => c.GetString()!))
            {
                for (var stem = name; stem is not null && animPath is null; stem = stem.Contains('_') ? stem[..stem.LastIndexOf('_')] : null)
                    if (anims.TryGetValue($"AS_{stem}_{candidate}", out var hit)) { animPath = hit; from = $"AS_{stem}_{candidate}"; }
                if (animPath is not null) break;
            }
            if (animPath is null) continue;
            try
            {
                var seq = provider.LoadPackageObject<UAnimSequence>(animPath);
                var session = new ExportSession(null!);
                session.Add(seq);
                var res = await session.RunAsync($"{dir}/anims", new ExportOptions(meshFormat: EMeshFormat.ActorX), null, CancellationToken.None);
                if (res.All(x => x.Success)) used[role] = from!;
                else errors.AddRange(res.Where(x => !x.Success).Select(x => $"{role}: {x.Error?.Message}"));
            }
            catch (Exception e) { errors.Add($"{role}: {e.GetType().Name}: {e.Message}"); }
        }
        var animMs = sw.ElapsedMilliseconds;

        return Json(new()
        {
            ["name"] = name,
            ["mesh"] = mesh?.Name ?? "",
            ["files"] = OutFiles(name).Select(f => new Dictionary<string, object> { ["path"] = f.path, ["file"] = f.file, ["bytes"] = new FileInfo(f.path).Length }).ToList(),
            ["materials"] = materials,
            ["textures"] = textures,
            ["animations"] = used,
            ["errors"] = errors,
            ["ms"] = new Dictionary<string, object> { ["mesh"] = meshMs, ["textures"] = textureMs, ["animations"] = animMs },
            ["reads"] = JsFileStream.Reads - reads0,
        });
    }

    /// <summary>One file an export wrote, by the path ExportPal listed.</summary>
    [JSExport]
    public static byte[] ReadFile(string path) => File.Exists(path) ? File.ReadAllBytes(path) : [];

    /// <summary>Free a pal's files: WebAssembly memory never shrinks, but freed space is reused.</summary>
    [JSExport]
    public static int Clear(string name)
    {
        var n = 0;
        foreach (var f in OutFiles(name)) { File.Delete(f.path); n++; }
        return n;
    }

    /// <summary>
    /// The files written under /x/{name}/. CUE4Parse's export joins paths with '\',
    /// an ordinary character on the browser's Unix-style file system, so it writes
    /// "/\x\name\...\SK_Name.glb" as one file in "/" (upstream: ExportSession.cs:172).
    /// Accept both separators.
    /// </summary>
    static IEnumerable<(string path, string file)> OutFiles(string name) =>
        Directory.GetFiles("/", "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true })
            .Select(p => (path: p, norm: p.Replace('\\', '/')))
            .Where(x => x.norm.Contains($"/x/{name}/"))
            .Select(x => (x.path, x.norm[(x.norm.LastIndexOf('/') + 1)..]));

    /// <summary>
    /// The mesh export is normally named after its package, but SK_GrassMinotaur_Ice
    /// holds one called SK_GrassMinotaur_Ice_Eye: fall back to the first skeletal mesh.
    /// </summary>
    static USkeletalMesh LoadMesh(string path)
    {
        try { return provider!.LoadPackageObject<USkeletalMesh>(path); }
        catch
        {
            return provider!.LoadPackage(path).GetExports().OfType<USkeletalMesh>().FirstOrDefault()
                ?? throw new InvalidOperationException($"no skeletal mesh in {path}");
        }
    }


    // ------------------------------------------------------------------ icons

    static readonly Regex IconRe = new(@"/PalIcon/Normal/T_(.+)_icon_normal\.uasset$", RegexOptions.IgnoreCase);

    /// <summary>
    /// The pals with a flat 2D icon in the game: codename -> texture package path.
    /// Built once per mount: scanning all 185,141 file names costs about half a
    /// second in the interpreter, which per icon made 288 icons take 164 s.
    /// </summary>
    static Dictionary<string, string>? icons;
    static Dictionary<string, string> Icons() => icons ??= provider!.Files.Keys
        .Select(k => (k, m: IconRe.Match(k)))
        .Where(x => x.m.Success)
        .GroupBy(x => x.m.Groups[1].Value, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.First().k[..g.First().k.LastIndexOf('.')], StringComparer.OrdinalIgnoreCase);

    [JSExport]
    public static string ListIcons() =>
        provider is null ? Json(new() { ["error"] = "The game files aren't open yet." })
            : Json(new() { ["icons"] = Icons().Keys.OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList() });

    /// <summary>
    /// One pal's icon decoded at up to maxEdge pixels, as raw pixels in
    /// /x/_icons/{codename}.raw for the worker to read and turn into WebP.
    /// </summary>
    [JSExport]
    public static string ExportIcon(string codename, int maxEdge)
    {
        if (provider is null) return Json(new() { ["error"] = "The game files aren't open yet." });
        if (!Icons().TryGetValue(codename, out var path)) return Json(new() { ["error"] = $"No icon for {codename}." });
        try
        {
            TextureDecoder.UseAssetRipperTextureDecoder = true;
            var tex = provider.LoadPackageObject<UTexture2D>(path);
            var decoded = TextureDecoder.Decode(tex, maxEdge, ETexturePlatform.DesktopMobile);
            if (decoded is null) return Json(new() { ["error"] = $"{codename}: decoded to nothing" });
            Directory.CreateDirectory("/x/_icons");
            var file = $"/x/_icons/{codename}.raw";
            File.WriteAllBytes(file, decoded.Data);
            return Json(new() { ["path"] = file, ["width"] = decoded.Width, ["height"] = decoded.Height, ["format"] = decoded.PixelFormat.ToString() });
        }
        catch (Exception e) { return Json(new() { ["error"] = $"{codename}: {e.GetType().Name}: {e.Message}" }); }
    }

    /// <summary>Delete one file the worker has read.</summary>
    [JSExport]
    public static void DeleteFile(string path) { if (File.Exists(path)) File.Delete(path); }

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
