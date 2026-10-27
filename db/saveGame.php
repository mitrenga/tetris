<?php

/**
 * A game played: the name typed into the original's table of results, its
 * level and score into `rg_tetris1984_hallOfFame` (`app/gameModel.js`). The
 * name comes as text (KOI-7 read as Cyrillic), the score as the unsigned
 * word the original keeps.
 */
class DataCommand {

  public function execute($postData) {
    $data = json_decode($postData);
    $mysqli = new mysqli($GLOBALS['dbHostname'], $GLOBALS['dbUser'], $GLOBALS['dbPassword'], $GLOBALS['dbName']);
    $stmt = $mysqli->prepare('INSERT INTO `rg_tetris1984_hallOfFame` (`name`, `score`, `level`, `created`) VALUES (?, ?, ?, NOW())');
    $name = mb_substr((string) ($data->name ?? ''), 0, 64);
    $score = ((int) ($data->score ?? 0)) & 0xffff;
    $level = ((int) ($data->level ?? 0)) & 0xffff;
    $stmt->bind_param('sii', $name, $score, $level);
    $stmt->execute();
    $stmt->close();
    $mysqli->close();
    return ['saved' => true];
  } // execute

} // class DataCommand
