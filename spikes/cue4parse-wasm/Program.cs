using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;

// Part 1 of the spike: does CUE4Parse load and run inside the browser at all?
Console.WriteLine("cue4parse-wasm: runtime started");

public static partial class Spike
{
    /// <summary>Touch CUE4Parse for real: build a provider and report what the runtime looks like.</summary>
    [JSExport]
    public static string Hello()
    {
        var sw = Stopwatch.StartNew();
        var provider = new StreamedFileProvider("Palworld", true, new VersionContainer(EGame.GAME_UE5_1));
        var parallelSum = 0;
        Parallel.For(0, 8, i => Interlocked.Add(ref parallelSum, i));
        return string.Join("\n", new[]
        {
            $"CUE4Parse {typeof(StreamedFileProvider).Assembly.GetName().Version}",
            $"provider: {provider.GetType().Name}, game {provider.Versions.Game}",
            $"runtime: {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription} on {System.Runtime.InteropServices.RuntimeInformation.OSDescription}",
            $"processors: {Environment.ProcessorCount}, Parallel.For sum (want 28): {parallelSum}",
            $"took {sw.ElapsedMilliseconds} ms",
        });
    }
}
