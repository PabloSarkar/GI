/* ==========================================================================
   GLADIVS IMPERIVM  —  main.js
   Bootstrap: build the game, attach the UI, hide the loader, raise the title.
   ========================================================================== */
(function (GI) {
  'use strict';
  window.addEventListener('DOMContentLoaded', () => {
    const game = new GI.Game();
    const ui = new GI.UI(game);
    game.ui = ui;
    GI._game = game;     // handle for debugging / automated tests

    // first user gesture unlocks WebAudio
    const unlock = () => { GI.audio.init(); GI.audio.resume(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);

    const loader = document.getElementById('loading');
    if (loader) loader.classList.add('hidden');

    game.start();
    ui.toTitle();
  });
})(window.GI = window.GI || {});
