# Verificare Android pe telefon fizic — 26 octombrie 2026

## Mediu

Motorola Edge 70, Android 16, WhatsApp 2.26.41.77. Conectare USB prin ADB, cu `adb reverse tcp:8080 tcp:8080`; aplicația folosește `http://127.0.0.1:8080/api/`.

Serverul rulează în proiectul Docker Compose separat `sticker-foundry-phone-qa`, cu volume și credențiale proprii. Au fost reproduse problemele pe imaginile publicate v1.3.0. Pentru reverificare, imaginea backend publicată a fost extinsă cu codul compilat local; webul rămâne imaginea publicată v1.3.0. Aceasta este testare locală în modul production, fără publicare pe internet și fără validarea unui proxy HTTPS extern.

APK-ul instalat este varianta **debug** construită din sursele modificate, cu identitatea și versiunea aplicației 1.3.0. Nu reprezintă un release nou publicat. Buildul original publicat avea SHA-256 `e2a41f816d97eadcd3d21c100726ce66037dd0e1d538a17731048eb39bacfdb0`.

Ultimul APK instalat în această sesiune are SHA-256 `c62a3843b86bef0de355898cf85455d004169f13b03bfebac184b1049beda568`. Telefonul a fost deconectat după verificarea izolării conturilor și ștergerea packului de test clonat; testele suplimentare pe dispozitiv necesită reconectare.

## Schimbări UI verificate

- Bara packului folosește iconițe pentru upload individual/multiplu, iconiță de pack, export și partajare. Acțiunile au etichete pentru cititoare de ecran și tooltip la apăsare lungă; țintele tactile standard sunt păstrate.
- Cele cinci secțiuni ale packului sunt accesibile într-un singur rând de iconițe. Titlurile lungi din antet nu mai măresc excesiv rândul.
- Au fost eliminate repetarea numelui/publisherului în overview și rândurile supradimensionate de butoane. Acțiunile WhatsApp păstrează textul.
- Cardurile cu statistici de pe Home și rândurile de setări sunt mai compacte. Packurile recente deschid direct packul ales.
- Reordonarea stickerelor este în meniul fiecărui rând; copierea, mutarea, ștergerea și anularea selecției folosesc iconițe.
- Setările folosesc mai mult din lățimea telefonului și un selector de secțiuni. Butonul pentru echipă nouă nu se mai rupe în litere verticale; formularul arată rezultatul acțiunilor.
- Editorul folosește un dialog mai lat și iconițe pentru rotație, reset și undo/redo. Culorile suprafețelor sunt aliniate cu tema aplicației.
- Utilizatorii viewer nu primesc tabul de editare a setărilor packului. Controalele de upload sunt dezactivate pentru ei; proprietarul echipei nu poate fi modificat accidental din controalele pentru membri.
- Joburile finalizate nu mai păstrează un card de procesare pe ecran, iar progresul este filtrat după pack.

Capturile și arborii de accesibilitate sunt păstrate local în `test-results/physical-android/` (director ignorat de Git). Exemple: `17-import-immediate.png` înainte, `final-03-pack-light.png` și `final-02-pack-dark.png` după; `56-teams.png` înainte și `ui-08-teams.png` după.

## Defecte reproduse și corectate

| Defect | Corecție și reverificare |
| --- | --- |
| Pornirea production rămânea blocată: workerul aștepta API healthy, iar API readiness aștepta workerii | Workerul așteaptă pornirea API-ului. Webul continuă să aștepte readiness. PostgreSQL, Redis, API și web au ajuns healthy; toate cele trei cozi au worker disponibil. |
| API list/detail omiteau `canExport`, dezactivând exportul unui pack valid | Eligibilitatea folosește numărul exportabil și limitele 3–30, inclusiv aprobările. Exportul nativ a produs ZIP și a deschis meniul Android de partajare. |
| Jobul de upload nu conținea `packId` în payloadul consumat de worker | Identificatorul este transmis în payload. Uploadul individual și multiplu au salvat stickere; au fost adăugate teste de regresie. |
| Primul upload într-un pack nou cerea sincronizare, dar un pack cu sub trei stickere nu poate fi exportat/sincronizat | Versiunea este citită din API când cacheul lipsește. Finalizarea uploadului sincronizează biblioteca fără să trateze un pack încă neexportabil drept upload eșuat. |
| Progresul rămânea la 30% | Monitorizarea include starea serverului `PROCESSING`; aceasta poate fi și anulată din UI. |
| Alegerea „None” pentru fundal nu era trimisă, iar serverul folosea implicit AI | Modul este transmis explicit inclusiv pentru `none`. |
| Primul sticker animat era salvat, dar generarea automată a iconiței eșua | Iconița automată se generează static din primul cadru. Uploadurile manuale de iconițe animate sunt în continuare respinse. Testul de imagine verifică rezultatul static 96×96. Jobul eșuat a fost reluat și finalizat; packul animat a ajuns la trei stickere. |
| WhatsApp revenea imediat fără confirmare | Importul este lansat cu Activity Result API și preia rezultatul/erorile de validare. Au fost acceptate atât packul static, cât și cel animat; aplicația a afișat confirmarea și „Open WhatsApp”. Referință: [exemplul oficial WhatsApp](https://github.com/WhatsApp/stickers/blob/main/Android/app/src/main/java/com/example/samplestickerapp/AddStickerPackActivity.java). |
| Un cont nou vedea packurile private rămase în cache de la contul anterior | Cacheul se șterge la logout, înregistrare și schimbarea contului la autentificare reușită. Reverificarea a confirmat ștergerea directoarelor locale și faptul că noul cont sincronizează numai packul public la care are acces. |

## Acoperire funcțională

„Trecut” înseamnă scenariile enumerate, nu toate combinațiile posibile ale funcției.

| Zonă | Rezultat observat |
| --- | --- |
| Server | URL salvat, conexiune validă, eroare pentru server inaccesibil, restaurarea conexiunii: trecut. |
| Autentificare | Cont demonstrativ, parolă greșită cu mesaj explicit, logout, cont nou creat din UI: trecut. Schimbarea parolei și restaurarea ei, revocarea unei sesiuni: confirmate și în audit. |
| Permisiuni | Invitație viewer acceptată din aplicație; funcțiile de editare nu sunt disponibile contului viewer. Izolarea cacheului între conturi a trecut după corecție. |
| Bibliotecă | Navigare Home/Packs/Settings, căutare cu/fără rezultate, deschiderea packului, creare static/animat și clonare: trecut. Meniul de filtre a fost inspectat; toate combinațiile filtre/sortări nu au fost epuizate. |
| Pack | Descriere modificată și păstrată, clonare cu copie privată, dialog de ștergere anulat și apoi confirmat pentru copia de test: trecut. |
| Stickere | Text de accesibilitate și aprobare salvate/reîncărcate, reordonare din meniul nou, selecție, copiere și mutare: trecut. |
| Comentarii | Adăugare și ștergere, cu evenimente în Activity: trecut. |
| Colaborare | Invitație creată/revocată, acceptare viewer, echipă creată, membru adăugat, rol modificat și membru eliminat: trecut. |
| Upload | Fișier individual, două imagini într-un batch, primul upload fără cache și batch animat: trecut după corecții. Duplicate vizuale respinse explicit; setul animat a fost refăcut cu forme distincte. |
| Editor | Deschidere, preseturi, rotație stânga/dreapta, reset, activarea textului și introducere text, activarea pensulei și selectarea erase/restore, grayscale, selectarea modului de fundal: exercitate. Calitatea vizuală a pensulei, fiecare slider și toate combinațiile de editări cer încă verificare separată. |
| Joburi | Progres observat, upload finalizat, export finalizat și retry al jobului animat prin API: trecut. Retry/cancel din fiecare stare nu sunt epuizate în UI. |
| Export | ZIP și meniul nativ de partajare: trecut. Nu s-a selectat un destinatar. |
| WhatsApp | Dialogul cu cele trei stickere, „ADD TO YOUR STICKERS”, rezultat OK și schimbare în „Open WhatsApp”: trecut pentru static și animat. Trimiterea efectivă într-un chat și playbackul în chat nu au fost executate. |
| Setări | Temă light/dark/light, server, securitate, echipe, setări admin salvate și audit exportat, Help și dialogul de troubleshooting: exercitate. |

## Validări automate

- `npm run test:backend`: **18 suite, 80 teste trecute**.
- `npm run lint:backend`: trecut.
- `npm run build:backend`: trecut.
- `:app:assembleDebug :app:lintDebug`: trecut cu JDK 17; există avertismente de deprecări Android/Compose, fără erori de build/lint.
- `npm run compose:validate`, plus validarea explicită a configurației production: trecute.
- Instanța locală este lăsată pornită pentru verificare și APK-ul modificat este instalat pe telefon.

## Verificări rămase

- WhatsApp Business: nu este instalat pe telefon; scenariile de import în Business necesită aplicația configurată.
- Livrarea emailului de resetare a parolei: nu există SMTP configurat în instanța izolată.
- Parcurgere completă a controalelor vizuale ale editorului, înlocuire imagine/iconiță, toate limitele și conflictele de editare concurentă.
- Validare offline după repornire, toate filtrele/sortările, ștergerea stickerelor și retenția auditului.
- HTTPS/cookies secure în infrastructura reală, APK release semnat și testare pe alte versiuni/dispozitive Android.

Nu se declară finalizată certificarea completă de producție pe baza acestei sesiuni.

## Următorul pas convenit

Corecțiile testate și îmbunătățirile UI sunt integrate pe `main`. Migrarea interfeței către Flutter va avea un branch separat. Editorul direct pe imagine — canvas mare, gesturi, text poziționabil și unelte într-o bară inferioară — face parte din această etapă; nu este prezentat ca implementat în APK-ul verificat aici.
