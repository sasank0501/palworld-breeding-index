// Deliberately empty. model-viewer switches its bundled meshopt decoder on only after a "decoder
// location" script has loaded (src/design/PalModel.tsx, enableMeshopt); this is that script. A file
// on this site, not a data: URL, so the Content-Security-Policy can refuse every script that is not ours.
