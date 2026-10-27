<?php
  // Public since 2026-10-27 (operator), so that the author can judge its fidelity (ZADANI.md §0).
  $appName = 'TETRIS 1984';
  $appDescription = 'Historically faithful remake of the first Tetris (Alexey Pajitnov / Алексей Пажитнов, Elektronika 60, 1984) on the terminal platform of svision.';
  $appPrefix = 'tetris1984';
  $appNoscript =
    '<h1>TETRIS 1984</h1>'.
    '<p>A historically faithful remake of the first Tetris, written by '.
    'Alexey Pajitnov (Алексей Пажитнов) in 1984 for the Elektronika 60 with a text terminal. '.
    'Tetris is a trademark of The Tetris Company; this is an unofficial, non-commercial reconstruction.</p>'.
    '<p>Please enable JavaScript to start it.</p>';
  $appOpenGraph = [
    'image' => 'images/poster.png',
  ];
  $appJsonLd = [
    'genre' => 'Puzzle',
    'isBasedOn' => [
      '@type' => 'VideoGame',
      'name' => 'Tetris',
      'author' => [
        ['@type' => 'Person', 'name' => 'Alexey Pajitnov', 'alternateName' => 'Алексей Пажитнов'],
      ],
      'datePublished' => '1984',
      'gamePlatform' => 'Elektronika 60',
    ],
  ];
  $devMode = true;                       // the sources are served until a bundle is built for a deployment
  if (file_exists(__DIR__.'/config/config.php')) {
    require_once __DIR__.'/config/config.php';
  }
  require_once 'app/svision/php/main.php';
