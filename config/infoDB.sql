SELECT `ndx`, `name`, `score`, `level`, `created`
FROM `rg_tetris1984_hallOfFame`
ORDER BY `ndx` DESC
LIMIT :limit
