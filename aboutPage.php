<?php

require_once 'app/svision/php/abstractAboutPage.php';

/**
 * The /about page: the story of the first Tetris on the Elektronika 60 and of
 * this remake, with links to Wikipedia and to Vadim Gerasimov's Tetris Story.
 *
 * ★ **The project is public** (operator 2026-10-27, `ZADANI.md` §0; internal
 * before that), so that the author can judge its fidelity: Tetris is a live
 * trademark of The Tetris Company, so the page describes the work and says
 * who owns the original. It has the shape of its siblings' pages; the
 * footer names the licence of the remake code (CC BY-NC-SA 4.0, like Manic
 * Miner) and the GitHub repository. Names are written in Latin
 * and in Cyrillic (`CLAUDE.md`).
 */
class AboutPage extends AbstractAboutPage {

  protected function aboutData() {
    return [
      'image' => 'images/cover.png',
      'sections' => [
        [
          'heading' => 'The original game (1984)',
          'html' =>
            '<p>Tetris was written by Alexey Pajitnov (Алексей Пажитнов) in 1984 at the Computing Centre '.
            'of the Academy of Sciences of the USSR in Moscow (Вычислительный центр АН СССР), in Pascal '.
            'under RT-11 on an Elektronika 60 (Электроника-60), a Soviet clone of the DEC PDP-11. The '.
            'machine had no graphics at all — only a text terminal — so the well, the falling pieces and '.
            'the score are all made of characters. The name joins <i>tetromino</i> and <i>tennis</i>.</p>'.
            '<p>Seven pieces of four squares fall into a well ten squares wide and twenty deep; a full row '.
            'disappears. There are ten levels to start from, a preview of the next piece that can be '.
            'switched off, and a table of the twenty best results. Pieces turn in place, with no nudging '.
            'off the walls. The first version drew each square of a piece as two DEL characters, which the '.
            'Soviet terminals showed as a solid block; a later revision changed them to <code>[]</code>.</p>'.
            '<p>The game spread from Moscow to the IBM PC in 1985, when Vadim Gerasimov '.
            '(Вадим Герасимов) ported it, and from there to the rest of the world.</p>',
        ],
        [
          'heading' => 'This remake',
          'html' =>
            '<p>This is not a modern Tetris in a retro coat, but a historically faithful reconstruction of '.
            'the very first one. It is rewritten for the web browser rather than emulated: the program of '.
            'the surviving original, <code>TET.SAV</code> from a disk of games for the PDP-11, is carried '.
            'over routine by routine, and it draws on a model of the 15IE-00-013 (15ИЭ-00-013) terminal, '.
            'a Soviet clone of the DEC VT52, with the terminal\'s own character set.</p>'.
            '<p>Nothing is guessed where the original can answer. The rules come out of its code, and whole '.
            'games recorded on the original running under RT-11 are played through again and compared step '.
            'by step, down to every byte the program sends to the terminal. Where no evidence exists, the '.
            'choice made is documented as a reconstruction.</p>'.
            '<p>It runs directly in your browser and is played on the keyboard, as on the terminal.</p>'.
            $this->installNote(),
        ],
        [
          'heading' => 'Other games',
          'html' =>
            '<p>This remake is one of a growing collection of classic games from the 8-bit and 16-bit era '.
            '— ZX Spectrum, Commodore 64, arcade and more — rebuilt faithfully on the same library and '.
            'playable in your browser, free of charge. Browse the whole collection at '.
            '<a href="https://retrogames.free/" target="_blank" rel="noopener">retrogames.free</a>.</p>',
        ],
      ],
      'links' => [
        ['label' => 'Tetris on Wikipedia', 'url' => 'https://en.wikipedia.org/wiki/Tetris'],
        ['label' => 'Alexey Pajitnov on Wikipedia', 'url' => 'https://en.wikipedia.org/wiki/Alexey_Pajitnov'],
        ['label' => 'Electronika 60 on Wikipedia', 'url' => 'https://en.wikipedia.org/wiki/Electronika_60'],
        ['label' => 'Tetris Story by Vadim Gerasimov', 'url' => 'https://vadim.oversigma.com/Tetris.htm'],
      ],
      'footer' =>
        '<p>An unofficial, non-commercial reconstruction, made as a study of the first Tetris. Tetris was '.
        'created by Alexey Pajitnov (Алексей Пажитнов); the Tetris name and game are trademarks of '.
        'The Tetris Company, and the rights are held by Tetris Holding, LLC. '.
        'Remake source code is available on <a href="https://github.com/mitrenga/tetris" target="_blank" rel="noopener">GitHub</a> '.
        'under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>.</p>',
    ];
  } // aboutData

} // AboutPage
