# images/ — the app icons and the cover

| file | what it is |
|---|---|
| `poster.png` | poster 1448 × 1086 (operator, 2026-10-27, supplied as `cover.png`): the Open Graph image of `index.php` |
| `cover.png` | cover 800 × 600 for `/about` (`../aboutPage.php`), the poster scaled down: `convert poster.png -resize 800x600 -strip cover.png` |

`app-icon.svg` (operator, 2026-10-27) is the word TETRIS in green terminal
squares on dark grey, 512 × 512 in curves. It is **a drawing for the remake**,
not the original's screen: the original draws its pieces with two DEL
characters each and has no logo.

The PNG set and the favicon are made from it by the library's tools (symlinks
alongside, run by hand from this directory):

    ./make-app-icons      # app-icon-{192,256,512,1024,1980}x*.png
    ./make-favicon        # favicon.ico (128/64/48/32/16), a copy belongs in the root too

`svision/php/appPage.php` references the PNGs (`app-icon-*.png`).

The project is public (operator 2026-10-27, `../ZADANI.md` §0); Tetris is a
trademark of The Tetris Company, and the icon and the poster are the
remake's own pictures.
