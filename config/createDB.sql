SET @dbname = 'tetris';

SET @query = CONCAT('CREATE DATABASE IF NOT EXISTS `', @dbname, '`');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = CONCAT('USE `', @dbname, '`');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- the games played, one row each, as the original's table of results keeps
-- them: the name typed, the level and the score (an unsigned word, as the
-- original compares it); the best 20 fill the original's table (db/hallOfFame.php)
CREATE TABLE IF NOT EXISTS rg_tetris1984_hallOfFame (
  `ndx` BIGINT(20) NOT NULL AUTO_INCREMENT,
  `name` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `score` INT NOT NULL,
  `level` SMALLINT NOT NULL DEFAULT 0,
  `created` TIMESTAMP NOT NULL,
  PRIMARY KEY (`ndx`),
  INDEX `score` (`score`),
  INDEX `name` (`name`),
  INDEX `created` (`created`),
  INDEX `created_name` (`created`, `name`)
);
