<?php

/**
 * The table of results of the original filled from the database
 * (`app/gameModel.js`): the 20 best **games**, a name as often as it got
 * there — the original's table keeps games, not players. Of equal scores
 * the newer game goes first, as the original puts a new one above the equal
 * ones it already has (★ the insertion stops at the first score not higher).
 */
class DataCommand {

  public function execute($postData) {
    $mysqli = new mysqli($GLOBALS['dbHostname'], $GLOBALS['dbUser'], $GLOBALS['dbPassword'], $GLOBALS['dbName']);
    $data = $mysqli->query('SELECT `name`, `score`, `level` FROM `rg_tetris1984_hallOfFame` '
      .'ORDER BY `score` DESC, `ndx` DESC LIMIT 20');
    $mysqli->close();
    return $data;
  } // execute

} // class DataCommand
