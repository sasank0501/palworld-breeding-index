/**
 * Logic for scripts/portrait-harness.html, driven by render-portraits.mjs.
 *
 * Kept out of the HTML on purpose: vite.config ignores scripts/ in its watcher,
 * so an inline module there is cached after the first request and edits stop
 * applying. render-portraits imports this file with a fresh query string each
 * run, which Vite treats as a new module and reads from disk.
 */
const mv = document.getElementById('mv');
const once = (el, ev) => new Promise((resolve, reject) => {
  el.addEventListener(ev, resolve, { once: true });
  el.addEventListener('error', reject, { once: true });
});
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

window.renderPortrait = async (url, { pose = 'idle', time = 0, orbit = '20deg 82deg auto' } = {}) => {
  // Re-rendering the model already loaded (the bind-pose retry) fires no
  // 'load' event, so only wait when the source actually changes.
  if (mv.src !== url) {
    const loaded = once(mv, 'load');
    mv.src = url;
    await loaded;
  }
  if (pose === 'bind') {
    // No animation: the bind pose. Every rig faces +Z in it, so the camera
    // angle is the same relative to every pal and the face is always in shot.
    // Pausing alone still holds frame 0 of the loop, so stop every action
    // in three.js's mixer: once nothing drives a bone, the mixer restores
    // its original glTF transform — the chibi-scaled bind pose.
    mv.pause();
    const sceneKey = Object.getOwnPropertySymbols(mv).find((k) => k.description === 'scene');
    const scene = sceneKey && mv[sceneKey];
    scene?.mixer?.stopAllAction();
    scene?.queueRender?.();
  } else {
    // Hold one frame of a loop: Idle (standing, facing forward) when the model
    // has it, else whatever it autoplays.
    if (pose === 'idle' && mv.availableAnimations.includes('Idle')) mv.animationName = 'Idle';
    mv.play();
    mv.currentTime = time;
    mv.pause();
  }
  await frame();
  // Framing measured on the posed model, not the bind pose (a sitting pal
  // would otherwise be framed for its T-pose).
  await mv.updateFraming();
  mv.cameraOrbit = orbit;
  mv.jumpCameraToGoal();
  await frame();
  await frame();
  const blob = await mv.toBlob({ mimeType: 'image/png' });
  return await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
};
window.harnessReady = customElements.whenDefined('model-viewer').then(() => true);
