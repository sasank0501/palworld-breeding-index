using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using CUE4Parse.UE4.Assets.Exports.SkeletalMesh;
using CUE4Parse.UE4.Assets.Exports.Animation;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Options;
using CUE4Parse_Conversion.Textures;
using SkiaSharp;

// Extracts pal portrait textures from the local Palworld install.
//
// The pak is unencrypted (footer reports bEncryptedIndex 0 and a zero key GUID),
// so this is a plain read of game files on this machine. Assets stay gitignored —
// they are Pocketpair's, and this repo is public.
//
//   dotnet run -- --list [substring]   discover paths, export nothing
//   dotnet run -- --one <substring>    export one texture, report its size
//   dotnet run -- --all <outDir>       export every pal icon
//   dotnet run -- --mesh <Name>        export SK_<Name> as glTF with its textures
//   dotnet run -- --anim <AS_Name>     export one animation sequence as .psa
//   dotnet run -- --batch [A,B,…]      every monster mesh + its animations, resumable

// `npm run build-portraits` finds the install (Steam library folders) and sets
// this; running the tool by hand needs it set to the Pal/Content/Paks directory.
var paks = Environment.GetEnvironmentVariable("PALWORLD_PAKS");
if (string.IsNullOrWhiteSpace(paks) || !Directory.Exists(paks))
{
    Console.Error.WriteLine($"Paks folder not found: {paks ?? "(PALWORLD_PAKS is not set)"}");
    Console.Error.WriteLine("Set PALWORLD_PAKS to the Pal/Content/Paks directory.");
    return 1;
}

var mode = args.Length > 0 ? args[0] : "--list";
var arg = args.Length > 1 ? args[1] : null;

Console.WriteLine($"Mounting {paks} …");
var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_1));
provider.Initialize();
// Unencrypted, but the provider still wants a key submitted for the null GUID.
provider.SubmitKey(new FGuid(), new FAesKey(new byte[32]));
provider.Mount();

// UE5 serializes properties unversioned, so nothing decodes without a type
// mappings file. These are build-specific — the community publishes one per game
// version — so prefer the largest .usmap in mappings/ and say which one was used.
var usmap = Environment.GetEnvironmentVariable("PALWORLD_USMAP");
if (usmap is null && Directory.Exists("mappings"))
    usmap = Directory.GetFiles("mappings", "*.usmap").OrderByDescending(f => new FileInfo(f).Length).FirstOrDefault();
if (usmap is not null && File.Exists(usmap))
{
    provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmap);
    Console.WriteLine($"Mappings: {Path.GetFileName(usmap)} ({new FileInfo(usmap).Length / 1024:N0} KB)");
}
else
{
    Console.WriteLine("Mappings: none — property export will fail; index probes still work.");
}

Console.WriteLine($"Mounted. {provider.Files.Count:N0} entries in the index.\n");

switch (mode)
{
    case "--list":
        return List(arg);
    case "--one":
        return One(arg);
    case "--sizes":
        return Sizes(arg);
    case "--big":
        return Big(arg);
    case "--top":
        return Top(arg);
    case "--files":
        return Files(arg);
    case "--mesh":
        return Mesh(arg);
    case "--anim":
        return Anim(arg);
    case "--batch":
        return Batch(arg);
    case "--refs":
        return Refs(arg);
    case "--all":
        return All(arg ?? "out");
    default:
        Console.Error.WriteLine($"Unknown mode {mode}");
        return 1;
}

// Print what the index actually holds, so the path convention is discovered
// rather than assumed.
int List(string? filter)
{
    var keys = provider.Files.Keys.ToList();

    if (filter is null)
    {
        Console.WriteLine("--- top-level directories ---");
        foreach (var g in keys.Select(k => string.Join('/', k.Split('/').Take(3)))
                              .GroupBy(p => p).OrderByDescending(g => g.Count()).Take(25))
            Console.WriteLine($"  {g.Count(),8:N0}  {g.Key}");

        Console.WriteLine("\n--- paths containing 'icon' (case-insensitive) ---");
        foreach (var g in keys.Where(k => k.Contains("icon", StringComparison.OrdinalIgnoreCase))
                              .Select(k => k[..k.LastIndexOf('/')])
                              .GroupBy(p => p).OrderByDescending(g => g.Count()).Take(30))
            Console.WriteLine($"  {g.Count(),8:N0}  {g.Key}");
        return 0;
    }

    var hits = keys.Where(k => k.Contains(filter, StringComparison.OrdinalIgnoreCase)).OrderBy(k => k).ToList();
    Console.WriteLine($"{hits.Count:N0} entries containing \"{filter}\":");
    foreach (var h in hits.Take(60)) Console.WriteLine("  " + h);
    if (hits.Count > 60) Console.WriteLine($"  … and {hits.Count - 60:N0} more");
    return 0;
}

// The gate: what resolution is the art actually stored at?
int One(string? needle)
{
    if (needle is null) { Console.Error.WriteLine("--one needs a substring"); return 1; }

    var path = provider.Files.Keys
        .Where(k => k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
        .FirstOrDefault(k => k.Contains(needle, StringComparison.OrdinalIgnoreCase));
    if (path is null) { Console.Error.WriteLine($"No .uasset matching \"{needle}\""); return 1; }

    Console.WriteLine($"Loading {path}");
    var texture = provider.LoadPackageObject<UTexture2D>(path[..path.LastIndexOf('.')]);
    var decoded = texture.Decode(ETexturePlatform.DesktopMobile);
    if (decoded is null) { Console.Error.WriteLine("Decoded to null"); return 1; }
    using var bitmap = decoded.ToSkBitmap();

    Console.WriteLine($"\n  RESOLUTION: {decoded.Width} x {decoded.Height}");
    Console.WriteLine($"  pixel fmt:  {decoded.PixelFormat}");
    Console.WriteLine($"  alpha:      {bitmap.AlphaType}");

    Directory.CreateDirectory("out");
    var name = Path.GetFileNameWithoutExtension(path);
    var file = Path.Combine("out", name + ".png");
    using (var img = SKImage.FromBitmap(bitmap))
    using (var data = img.Encode(SKEncodedImageFormat.Png, 100))
    using (var fs = File.OpenWrite(file))
        data.SaveTo(fs);
    Console.WriteLine($"  wrote:      {file} ({new FileInfo(file).Length / 1024:N0} KB)");
    return 0;
}

// Resolution probe that needs no .usmap: for a block-compressed texture the
// bulk payload is a fixed number of bytes per pixel, so the .ubulk size pins the
// dimensions without deserializing a single property.
int Sizes(string? needle)
{
    var names = provider.Files.Keys
        .Where(k => k.Contains("/PalIcon/Normal/", StringComparison.OrdinalIgnoreCase))
        .Where(k => needle is null || k.Contains(needle, StringComparison.OrdinalIgnoreCase))
        .GroupBy(k => k[..k.LastIndexOf('.')])
        .OrderBy(g => g.Key).Take(8).ToList();

    Console.WriteLine($"{"texture",-38} {"uasset",9} {"uexp",9} {"ubulk",11}   implied size");
    foreach (var g in names)
    {
        long Get(string ext) => provider.Files.TryGetValue(g.Key + ext, out var f) ? f.Size : 0;
        long bulk = Get(".ubulk"), uexp = Get(".uexp"), uasset = Get(".uasset");
        // BC7/BC3 = 1 byte/px, BC1 = 0.5. Full mip chains add ~33%.
        string implied = "";
        foreach (var (bpp, label) in new[] { (1.0, "BC7/BC3"), (0.5, "BC1") })
        {
            double px = bulk / bpp, side = Math.Sqrt(px);
            double sideNoMips = Math.Sqrt(px / 1.3333);
            implied += $"  {label}: {side:F0}^2 (or {sideNoMips:F0}^2 w/ mips)";
        }
        Console.WriteLine($"{Path.GetFileName(g.Key),-38} {uasset,9:N0} {uexp,9:N0} {bulk,11:N0} {implied}");
    }
    return 0;
}

// Where does the *large* pal art live, if anywhere? Group every bulk payload by
// directory and rank by the biggest texture in it. 16 KB = 128^2, 262 KB = 512^2,
// 1 MB = 1024^2 at one byte per pixel.
int Big(string? needle)
{
    var rows = provider.Files
        .Where(kv => kv.Key.EndsWith(".ubulk", StringComparison.OrdinalIgnoreCase))
        .Where(kv => needle is null || kv.Key.Contains(needle, StringComparison.OrdinalIgnoreCase))
        .GroupBy(kv => kv.Key[..kv.Key.LastIndexOf('/')])
        .Select(g => new { Dir = g.Key, Count = g.Count(), Max = g.Max(x => x.Value.Size) })
        .OrderByDescending(r => r.Max).Take(28).ToList();

    Console.WriteLine($"{"max bytes",12} {"~side",8} {"files",7}  directory");
    foreach (var r in rows)
        Console.WriteLine($"{r.Max,12:N0} {Math.Sqrt(r.Max / 1.0),8:F0} {r.Count,7:N0}  {r.Dir}");
    return 0;
}

// Individual largest bulk payloads under a path, to spot outliers hiding in a
// directory whose typical file is small.
int Top(string? needle)
{
    var rows = provider.Files
        .Where(kv => kv.Key.EndsWith(".ubulk", StringComparison.OrdinalIgnoreCase))
        .Where(kv => needle is null || kv.Key.Contains(needle, StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(kv => kv.Value.Size).Take(20).ToList();
    Console.WriteLine($"{"bytes",12} {"~side",8}  file");
    foreach (var r in rows)
        Console.WriteLine($"{r.Value.Size,12:N0} {Math.Sqrt(r.Value.Size),8:F0}  {Path.GetFileName(r.Key)}");
    var sizes = provider.Files.Where(kv => kv.Key.EndsWith(".ubulk") && (needle is null || kv.Key.Contains(needle))).Select(kv => kv.Value.Size).ToList();
    var distinct = string.Join(", ", sizes.Distinct().OrderBy(x => x));
    Console.WriteLine();
    Console.WriteLine($"{sizes.Count} files; distinct sizes: {distinct}");
    return 0;
}

// Every matching entry with its packed size, for sizing a delivery budget.
int Files(string? needle)
{
    var rows = provider.Files
        .Where(kv => needle is null || kv.Key.Contains(needle, StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(kv => kv.Value.Size).Take(30).ToList();
    long total = 0;
    foreach (var r in rows)
    {
        total += r.Value.Size;
        Console.WriteLine($"{r.Value.Size,12:N0}  {Path.GetFileName(r.Key)}");
    }
    Console.WriteLine();
    Console.WriteLine($"shown {rows.Count} files, {total / 1048576.0:F2} MB");
    return 0;
}

// Export a pal's skeletal mesh to glTF for offline rendering. Textures come out
// separately via --one; the material wiring happens in Blender off the
// _B/_N/_M/_EM suffix convention, which is identical for every pal.
int Mesh(string? needle)
{
    if (needle is null) { Console.Error.WriteLine("--mesh needs a pal internal name, e.g. KingBahamut"); return 1; }

    var path = provider.Files.Keys.FirstOrDefault(k =>
        k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase) &&
        k.Contains($"/SK_{needle}.", StringComparison.OrdinalIgnoreCase));
    if (path is null) { Console.Error.WriteLine($"No SK_{needle}.uasset in the pak"); return 1; }

    Console.WriteLine($"Loading {path}");
    var mesh = provider.LoadPackageObject<USkeletalMesh>(path[..path.LastIndexOf('.')]);

    var outDir = Path.Combine("out", needle);
    Directory.CreateDirectory(outDir);

    // ExportMaterials pulls the referenced textures out alongside the mesh, so
    // the glTF lands next to the maps Blender needs to wire up.
    // Everything else already defaults the way we want: PNG textures, materials
    // exported, DesktopMobile platform, highest mesh quality.
    var options = new ExportOptions(
        meshFormat: EMeshFormat.Gltf2,
        texturePlatform: ETexturePlatform.DesktopMobile,
        exportMaterials: true);

    var session = new ExportSession(null!);
    session.Add(mesh);
    var results = session.RunAsync(outDir, options, null, CancellationToken.None).GetAwaiter().GetResult();

    foreach (var r in results)
    {
        if (!r.Success) { Console.Error.WriteLine($"  FAILED {r.ObjectPath}: {r.Error?.Message}"); continue; }
        Console.WriteLine($"  exported {r.ObjectPath}");
    }

    Console.WriteLine();
    long total = 0;
    foreach (var f in new DirectoryInfo(outDir).GetFiles("*", SearchOption.AllDirectories).OrderByDescending(f => f.Length))
    {
        total += f.Length;
        Console.WriteLine($"    {f.Length,12:N0}  {f.Name}");
    }
    Console.WriteLine($"    {total,12:N0}  TOTAL ({total / 1048576.0:F1} MB)");
    return results.All(r => r.Success) ? 0 : 1;
}

// Export one animation sequence as ActorX .psa, e.g. AS_KingBahamut_Rest01.
// scripts/lib/psa.mjs reads it and bakes a pose (or a loop) into the web model.
int Anim(string? needle)
{
    if (needle is null) { Console.Error.WriteLine("--anim needs a sequence name, e.g. AS_KingBahamut_Rest01"); return 1; }

    var path = provider.Files.Keys.FirstOrDefault(k =>
        k.EndsWith($"/{needle}.uasset", StringComparison.OrdinalIgnoreCase));
    if (path is null) { Console.Error.WriteLine($"No {needle}.uasset in the pak"); return 1; }

    Console.WriteLine($"Loading {path}");
    var anim = provider.LoadPackageObject<UAnimSequence>(path[..path.LastIndexOf('.')]);

    var outDir = Path.Combine("out", "anims");
    Directory.CreateDirectory(outDir);
    // There is no separate animation format: animations follow meshFormat, and
    // this CUE4Parse refuses Gltf2 for them (ActorX, UEFormat and USD only).
    var options = new ExportOptions(meshFormat: EMeshFormat.ActorX);

    var session = new ExportSession(null!);
    session.Add(anim);
    var results = session.RunAsync(outDir, options, null, CancellationToken.None).GetAwaiter().GetResult();
    foreach (var r in results)
        Console.WriteLine(r.Success ? $"  exported {r.ObjectPath}" : $"  FAILED {r.ObjectPath}: {r.Error?.Message}");
    foreach (var f in new DirectoryInfo(outDir).GetFiles("*.psa", SearchOption.AllDirectories))
        Console.WriteLine($"    {f.Length,12:N0}  {f.FullName}");
    return results.All(r => r.Success) ? 0 : 1;
}

// Every pal in one mount: the mesh (+ textures and material JSON, as --mesh) and
// one animation per role in ../anim-roles.json (Rest, Idle, Walk, Sleep, Petting),
// which build-pal-models.mjs bakes into the models. Mounting the pak is the slow part,
// so this does it once for all ~300 monsters instead of once per pal.
//
// The pak is the source list — every pal mesh is an SK_<Name> under
// Model/Character/Monster/ — so there is no hand-kept roster to drift. Variants have their own mesh (Kitsunebi_Ice) but often reuse the base
// species' animations, so a missing AS_<Name>_* falls back to the name with its
// last _Suffix stripped, repeatedly.
//
// Resumable: anything already on disk is skipped, so a crash or Ctrl+C costs
// nothing — run it again. Writes out/batch-report.json either way.
//
//   dotnet run -- --batch                      every monster
//   dotnet run -- --batch SheepBall,JetDragon  just these
int Batch(string? filter)
{
    // Which animations to stage: role -> sequence names to try, first match wins.
    // Shared with build-pal-models.mjs so the two cannot drift.
    var rolesFile = Path.Combine("..", "anim-roles.json");
    var roles = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(rolesFile))!["roles"]!.AsArray()
        .Select(r => (role: (string)r!["role"]!, candidates: r!["candidates"]!.AsArray().Select(c => (string)c!).ToArray()))
        .ToList();
    var only = filter?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    // Any SK_ under a monster folder: most live in their own folder, but many
    // element variants share the base species' (Monster/Hedgehog/SK_Hedgehog_Ice).
    var meshRe = new System.Text.RegularExpressions.Regex(
        @"^Pal/Content/Pal/Model/Character/Monster/[^/]+/SK_([^/]+)\.uasset$",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    var meshes = provider.Files.Keys
        .Select(k => (path: k, m: meshRe.Match(k)))
        .Where(x => x.m.Success)
        .Select(x => (x.path, name: x.m.Groups[1].Value))
        .Where(x => only is null || only.Contains(x.name))
        .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase)
        .ToList();

    // File name -> package path for every monster animation, built once.
    var anims = provider.Files.Keys
        .Where(k => k.Contains("/Animation/Character/Monster/", StringComparison.OrdinalIgnoreCase)
                 && k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
        .GroupBy(k => Path.GetFileNameWithoutExtension(k), StringComparer.OrdinalIgnoreCase)
        .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

    Console.WriteLine($"{meshes.Count} monster meshes, {anims.Count:N0} monster animation assets\n");

    var meshOptions = new ExportOptions(meshFormat: EMeshFormat.Gltf2, texturePlatform: ETexturePlatform.DesktopMobile, exportMaterials: true);
    var animOptions = new ExportOptions(meshFormat: EMeshFormat.ActorX);
    var animDir = Path.Combine("out", "anims");
    var report = new List<object>();
    int done = 0, failed = 0;

    foreach (var (path, name) in meshes)
    {
        var meshDir = Path.Combine("out", name);
        string? error = null;
        try
        {
            var glb = Directory.Exists(meshDir)
                ? Directory.GetFiles(meshDir, $"SK_{name}.glb", SearchOption.AllDirectories).FirstOrDefault()
                : null;
            if (glb is null)
            {
                var mesh = LoadMesh(path);
                var session = new ExportSession(null!);
                session.Add(mesh);
                var res = session.RunAsync(meshDir, meshOptions, null, CancellationToken.None).GetAwaiter().GetResult();
                if (!res.All(r => r.Success)) error = string.Join("; ", res.Where(r => !r.Success).Select(r => r.Error?.Message));
            }
        }
        catch (Exception e) { error = e.Message; }

        // Animations, per role: each candidate in order, and for each the pal's
        // own sequence first, then progressively shorter base names (variants
        // borrow their base species'). The same search build-pal-models does.
        var animsUsed = new Dictionary<string, string>();
        foreach (var (role, candidates) in roles)
        {
            string? animPath = null, used = null;
            foreach (var anim in candidates)
            {
                for (var stem = name; stem is not null && animPath is null; stem = stem.Contains('_') ? stem[..stem.LastIndexOf('_')] : null)
                    if (anims.TryGetValue($"AS_{stem}_{anim}", out var hit)) { animPath = hit; used = $"{stem}:{anim}"; }
                if (animPath is not null) break;
            }
            if (animPath is null) continue;

            animsUsed[role] = used!;
            var psa = Path.Combine(animDir, animPath[..animPath.LastIndexOf('.')] + ".psa");
            if (File.Exists(psa)) continue;
            try
            {
                var seq = provider.LoadPackageObject<UAnimSequence>(animPath[..animPath.LastIndexOf('.')]);
                var session = new ExportSession(null!);
                session.Add(seq);
                session.RunAsync(animDir, animOptions, null, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception e) { animsUsed[role] = $"FAILED: {e.Message}"; }
        }

        if (error is null) done++; else failed++;
        report.Add(new { name, error, anims = animsUsed });
        var animNote = animsUsed.Count == 0
            ? "no anims"
            : string.Join(" ", animsUsed.Select(a => a.Value.StartsWith($"{name}:") ? a.Key : $"{a.Key}<-{a.Value.Split(':')[0]}"));
        Console.WriteLine($"[{done + failed,3}/{meshes.Count}] {(error is null ? "ok  " : "FAIL")} {name,-28} {animNote}{(error is null ? "" : "  " + error)}");
    }

    // A filtered run (--batch A,B) updates those pals' entries and keeps the rest,
    // rather than leaving a report that lists only A and B.
    var reportPath = Path.Combine("out", "batch-report.json");
    var merged = new SortedDictionary<string, System.Text.Json.Nodes.JsonNode?>(StringComparer.OrdinalIgnoreCase);
    if (only is not null && File.Exists(reportPath))
        foreach (var entry in System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(reportPath))!.AsArray())
            if ((string?)entry?["name"] is { } n) merged[n] = entry!.DeepClone();
    foreach (var entry in System.Text.Json.Nodes.JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(report))!.AsArray())
        merged[(string)entry!["name"]!] = entry.DeepClone();
    File.WriteAllText(reportPath,
        new System.Text.Json.Nodes.JsonArray(merged.Values.ToArray()).ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));

    // Blueprint-only pals: no SK_ of their own, so the Blueprint names another
    // pal's mesh. The names do not follow a pattern — Lyleen Noct (LilyQueen_Dark)
    // uses SK_LilyQueen_Ice, Bellanoir Libero (NightLady_Dark) SK_NightLady_Pink —
    // so they are read from each Blueprint rather than guessed. Written to
    // out/aliases.json for build-pal-models.mjs to fold into the manifest.
    if (only is null)
    {
        var meshNames = meshes.Select(m => m.name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var bpRe = new System.Text.RegularExpressions.Regex(
            @"/PalActorBP/[^/]+/BP_([^/]+)\.uasset$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var aliases = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in provider.Files.Keys)
        {
            var m = bpRe.Match(key);
            if (!m.Success) continue;
            var pal = m.Groups[1].Value;
            if (meshNames.Contains(pal) || pal.Contains("_BOSS") || pal.Contains("_RAID") || pal.Contains("_Skin")) continue;
            try
            {
                if (provider.LoadPackage(key[..key.LastIndexOf('.')]) is not CUE4Parse.UE4.Assets.Package p) continue;
                var sk = p.ImportMap.FirstOrDefault(i => i.ClassName.Text == "SkeletalMesh")?.ObjectName.Text;
                if (sk is not null && sk.StartsWith("SK_") && meshNames.Contains(sk[3..])) { aliases[pal] = sk[3..]; continue; }
                // Gumoss (Special) names only a prop (a poppy); fall back to the
                // parent Blueprint's species, so it shows as Gumoss minus the flower.
                var parentBp = p.ImportMap
                    .Where(i => i.ClassName.Text == "Package" && i.ObjectName.Text.Contains("/PalActorBP/"))
                    .Select(i => i.ObjectName.Text[(i.ObjectName.Text.LastIndexOf("/BP_") + 4)..])
                    .FirstOrDefault(n => meshNames.Contains(n));
                if (parentBp is not null) aliases[pal] = parentBp;
            }
            catch { /* an unreadable Blueprint just stays unaliased */ }
        }
        File.WriteAllText(Path.Combine("out", "aliases.json"),
            System.Text.Json.JsonSerializer.Serialize(aliases, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"{aliases.Count} Blueprint-only pals aliased to another mesh — out/aliases.json");
    }
    Console.WriteLine($"\nexported {done}, failed {failed} — out/batch-report.json");
    return failed > 0 ? 1 : 0;
}

// What a package points at — for Blueprint-only variants (BP_LilyQueen_Dark)
// that have no mesh of their own and must name some other mesh and materials.
int Refs(string? needle)
{
    if (needle is null) { Console.Error.WriteLine("--refs needs a package name, e.g. BP_LilyQueen_Dark"); return 1; }
    var path = provider.Files.Keys.FirstOrDefault(k => k.EndsWith($"/{needle}.uasset", StringComparison.OrdinalIgnoreCase));
    if (path is null) { Console.Error.WriteLine($"No {needle}.uasset"); return 1; }
    Console.WriteLine(path);
    var pkg = provider.LoadPackage(path[..path.LastIndexOf('.')]);
    if (pkg is CUE4Parse.UE4.Assets.Package p)
        foreach (var imp in p.ImportMap)
            if (imp.ClassName.Text is "SkeletalMesh" or "MaterialInstanceConstant" or "Texture2D" or "Package")
                Console.WriteLine($"  {imp.ClassName.Text,-26} {imp.ObjectName.Text}");
    return 0;
}

// The mesh export is normally named after its package, but not always —
// GrassMinotaur_Ice's package holds an export whose name differs (its textures
// already mix "Ice" and "ice"). Fall back to the first skeletal mesh inside.
USkeletalMesh LoadMesh(string path)
{
    var pkgPath = path[..path.LastIndexOf('.')];
    try { return provider.LoadPackageObject<USkeletalMesh>(pkgPath); }
    catch
    {
        var mesh = provider.LoadPackage(pkgPath).GetExports().OfType<USkeletalMesh>().FirstOrDefault();
        return mesh ?? throw new InvalidOperationException($"no USkeletalMesh export in {pkgPath}");
    }
}

int All(string outDir)
{
    Directory.CreateDirectory(outDir);
    var paths = provider.Files.Keys
        .Where(k => k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase))
        .Where(k => k.Contains("/PalIcon/", StringComparison.OrdinalIgnoreCase))
        .OrderBy(k => k).ToList();

    Console.WriteLine($"{paths.Count:N0} pal icon textures → {outDir}");
    int ok = 0, failed = 0;
    foreach (var path in paths)
    {
        var name = Path.GetFileNameWithoutExtension(path);
        try
        {
            var texture = provider.LoadPackageObject<UTexture2D>(path[..path.LastIndexOf('.')]);
            var decoded = texture.Decode(ETexturePlatform.DesktopMobile);
            if (decoded is null) { failed++; Console.Error.WriteLine($"  null: {name}"); continue; }
            using var bitmap = decoded.ToSkBitmap();
            using var img = SKImage.FromBitmap(bitmap);
            using var data = img.Encode(SKEncodedImageFormat.Png, 100);
            using var fs = File.OpenWrite(Path.Combine(outDir, name + ".png"));
            data.SaveTo(fs);
            ok++;
        }
        catch (Exception e)
        {
            failed++;
            Console.Error.WriteLine($"  fail: {name} — {e.Message}");
        }
    }
    Console.WriteLine($"\nexported {ok:N0}, failed {failed:N0}");
    return failed > 0 ? 1 : 0;
}
