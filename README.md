# Shell Serial Scanner

PWA do skanowania numerów seryjnych (Prefab → Shell) i składania ich w sety. Działa na telefonie, offline, bez backendu. Wszystkie dane siedzą w IndexedDB na urządzeniu.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173 (też w sieci lokalnej, patrz niżej)
npm run build      # wynik w dist/
npm run preview    # podgląd zbudowanej wersji
npm test           # testy jednostkowe (vitest)
npm run lint
```

Kamera w przeglądarce wymaga HTTPS albo `localhost`. Żeby przetestować na telefonie przed wdrożeniem, najprościej wrzucić `dist/` na hosting z HTTPS (niżej) albo użyć tunelu typu `cloudflared` / `ngrok` do `npm run preview`.

## Wdrożenie

`npm run build` tworzy statyczny katalog `dist/`. Wystarczy go wrzucić na dowolny hosting HTTPS: GitHub Pages, Cloudflare Pages, Netlify, zwykły nginx. Node.js na serwerze nie jest potrzebny. Build używa ścieżek względnych (`base: './'`), więc działa też z podkatalogu, np. `https://user.github.io/repo/`.

Po pierwszym otwarciu service worker zapisuje wszystkie pliki w cache. Od tego momentu aplikacja startuje, otwiera kamerę, skanuje, zapisuje i eksportuje bez internetu. Na Androidzie w Chrome warto dać „Dodaj do ekranu głównego”, wtedy odpala się jak normalna aplikacja (pełny ekran, pion).

Nowa wersja wrzucona na serwer zainstaluje się sama przy następnym uruchomieniu z dostępem do sieci.

## Jak działa skanowanie

- Kamera tylna (`facingMode: environment`), 1080p, ciągły autofocus jeśli telefon go obsługuje. Na Androidzie aplikacja próbuje wybrać główny obiektyw zamiast szerokokątnego (ten drugi często nie łapie ostrości z bliska). Po starcie zoom jest cofany do 1x, bo niektóre telefony oddają obraz już przybliżony.
- Liczy się tylko kod, którego środek jest wewnątrz celownika. Jeśli w celowniku są dwa kody, wygrywa większy, a przy podobnej wielkości ten bliżej środka.
- Kod jest akceptowany dopiero po ok. 400 ms stabilnego odczytu (min. 3 trafienia). Jeśli w tym czasie pojawi się inny kod, licznik startuje od nowa, więc dwa migające kody nigdy nie zostaną przyjęte przypadkiem.
- Kod, który właśnie został przyjęty albo odrzucony, jest ignorowany, dopóki nie zniknie z celownika. Dzięki temu prefab, który jeszcze jest w kadrze, nie wskoczy jako numer shella.
- Silnik: na Android Chrome natywny `BarcodeDetector` (ML Kit, działa na urządzeniu, offline). Tam gdzie go nie ma (Brave, iOS, desktop) ZXing (`@zxing/library`) dekoduje wycinek obrazu z celownika. Na Androidzie najlepiej używać Chrome. W trybie zdjęcia ZXing działa zawsze, w osobnym wątku (Web Worker), równolegle z OCR.
- Po dobrym odczycie: zielona ramka, wibracja, krótki beep (Web Audio, bez plików), numer na ekranie i po 500 ms przejście dalej.

Obsługiwane formaty: Code 128, Code 39, EAN-13, EAN-8, UPC-A, UPC-E, ITF.

## OCR, zdjęcie i latarka

Na ekranie skanowania są przyciski:

- **Enter manually** otwiera klawiaturę numeryczną. Przycisk ABC przełącza na litery, gdyby format numerów się zmienił.
- **Read text** przełącza skaner na OCR. Wtedy w celownik łapie się wiersz z numerem (dla prefabu "Production Order"), a nie barcode. Odczytany numer zawsze trzeba potwierdzić, bo OCR potrafi pomylić cyfry. Wybrany tryb zapamiętuje się osobno dla prefabu i shella.
- **Photo** pozwala zrobić albo wybrać zdjęcie. Aplikacja szuka na nim wszystkich kodów kreskowych (także małych i obróconych o 90°, zdjęcie jest dodatkowo wyostrzane) oraz numerów w tekście. Znalezione rzeczy zaznacza ramkami i pokazuje jako listę pod zdjęciem. Numer z wiersza "Production Order" jest oznaczony jako Suggested. Jeśli czegoś nie znalazła, stuknij palcem w kod albo numer na zdjęciu. Wtedy ten fragment jest powiększany i czytany jeszcze raz, osobno jako barcode i jako tekst (z obróbką pod kropkowy nadruk, np. "Serial no.: 839662" na shellach).
- **Lens 1/3** (widoczny tylko gdy telefon ma więcej niż jeden tylny aparat) przełącza na kolejny obiektyw. Przydaje się na telefonach z teleobiektywem, np. Oppo Find X9 Ultra, gdzie obraz w Chrome bywa mocno przybliżony (najpewniej otwiera się teleobiektyw). Wybór zapamiętuje się na stałe, a pod celownikiem na chwilę pojawia się systemowa nazwa obiektywu (np. `camera2 2, facing back`).
- **Light** włącza latarkę. Jeśli telefon albo przeglądarka nie pozwala nią sterować, pojawi się komunikat. Na iPhonie Safari nie daje dostępu do latarki.

Numery z OCR mają w danych `inputMethod: ocr`.

OCR to Tesseract.js z angielskim modelem. Pliki (silnik ok. 4 MB, model ok. 3 MB) są kopiowane z `node_modules` do `public/ocr` przy `npm run dev` / `npm run build` i trafiają do cache service workera. OCR działa więc offline, a zdjęcia nigdzie nie wychodzą. Pierwsze uruchomienie aplikacji pobiera przez to ok. 8 MB.

## Konfiguracja (`src/config.ts`)

Gdy będzie wiadomo, jakiego dokładnie kodu używa produkcja, można:

- zawęzić `formats`, np. do `['code_128']` (szybciej i mniej pomyłek),
- dodać reguły dla prefabu albo shella, np. odrzucanie Material Number:

```ts
rules: {
  prefab: [{ rejectPattern: '^2946\\d{4}$', message: 'This looks like a Material Number' }],
  shell: [{ pattern: '^\\d{6}$', message: 'Shell serial should have 6 digits' }],
}
```

Reguła może też mieć `formats`, żeby np. prefab był akceptowany tylko z Code 128. Tam są też czasy: `stableMs`, `minHits`, `advanceDelayMs`.

Sekcja `ocr` mówi, jak wyciągnąć numer z tekstu: `anchor` to słowo obok numeru na etykiecie ("Production Order"), `skip` to wiersze do pominięcia (Item Number, data), `pattern` to dopuszczalny format numeru.

## Testowanie bez kamery

W trybie dev (`npm run dev`) albo z parametrem `?debug` w adresie na ekranie skanowania pojawia się przycisk **Simulate scan**. Wpisany tam numer przechodzi tą samą ścieżką co prawdziwy skan (`inputMethod: barcode`, duplikaty, reguły, wibracja). Przycisk **Enter manually** jest zawsze dostępny i zapisuje `inputMethod: manual`.

## Dane

Sety i shelle są w IndexedDB (`shell-scanner` → `sets`). Struktura w `src/lib/types.ts`.

- **Export current set** (w widoku setu) i **Export all sets** (Export Data) dają CSV:
  `Set,Position,Prefab Serial,Shell Serial,Prefab Input Method,Shell Input Method,Created At`
- **Backup** zapisuje wszystkie sety do JSON, **Restore backup** wczytuje je z powrotem. Sety o tym samym ID są nadpisywane, pozostałe zostają.

Na telefonie plik idzie przez systemowe menu udostępniania (zapis do plików, mail, Drive itd.), na komputerze jako zwykłe pobranie.

Nie ma serwera, więc backup to jedyna kopia danych poza telefonem. Wyczyszczenie danych przeglądarki albo odinstalowanie PWA kasuje wszystko. Aplikacja prosi przeglądarkę o trwałe przechowywanie (`navigator.storage.persist`), ale backup i tak warto robić regularnie.

Aplikacja nic nie wysyła w sieć: żadnych zdjęć, numerów ani telemetrii, brak analityki.

## Struktura

```
src/
  config.ts              formaty, reguły, czasy skanowania
  lib/                   logika setów, IndexedDB, CSV, backup, beep/wibracja
  scanner/               kamera, celownik → współrzędne wideo, wybór kodu, stabilizacja
  components/            skaner z ręcznym wpisem i ostrzeżeniem o duplikatach, dialogi
  screens/               ekrany aplikacji
  __tests__/             testy
```
