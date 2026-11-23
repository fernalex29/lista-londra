# Lista Londra – versione GitHub

La pagina (`index.html`) sta su **GitHub Pages**. Lista e biglietti stanno su **Supabase** (gratuito), così tu e lei vedete le stesse cose in tempo reale. Solo le vostre due email possono entrare.

Tempo totale: circa 15 minuti.

---

## 1. Crea il progetto Supabase

1. Vai su https://supabase.com, crea un account e premi **New project**.
2. Scegli un nome (es. `lista-londra`), una password per il database (salvala, ma non ti servirà nella pagina) e come regione **West EU (London)**.
3. Aspetta un paio di minuti che il progetto sia pronto.

## 2. Crea tabelle, spazio per i biglietti e regole d'accesso

1. Apri `supabase.sql` e **sostituisci le due email di esempio** con la tua e quella di lei.
2. In Supabase vai su **SQL Editor → New query**, incolla tutto il contenuto e premi **Run**. Deve comparire "Success".

## 3. Crea i vostri due account

1. **Authentication → Users → Add user → Create new user**.
2. Inserisci la tua email e una password, spunta **Auto Confirm User**, salva.
3. Ripeti con l'email di lei e una password da comunicarle (potrà restare collegata sul telefono).
4. **Authentication → Sign In / Providers** (o **Settings**): **disattiva "Allow new users to sign up"**, così nessun altro può crearsi un account.

Le email devono essere identiche a quelle scritte in `supabase.sql`.

## 4. Collega la pagina a Supabase

1. In Supabase apri **Project Settings → API** (oppure **API Keys**).
2. Copia **Project URL** e la chiave **anon public** (o **publishable**).
3. Incollale in `config.js` al posto dei segnaposto.

⚠️ Non usare mai la chiave **service_role** / **secret**: darebbe accesso a tutto a chiunque legga la pagina.

## 5. Pubblica su GitHub Pages

1. Su https://github.com crea un nuovo repository (es. `lista-londra`). Con l'account gratuito deve essere **Public**: si vede il codice, non i vostri dati, che restano protetti dal login.
2. **Add file → Upload files** e carica **solo** `index.html` e `config.js`. Non caricare `supabase.sql` con le vostre email dentro.
3. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch **main**, cartella **/ (root)**, Save.
4. Dopo 1–2 minuti la pagina è online su `https://TUO-UTENTE.github.io/lista-londra/`.

## 6. Mandala su WhatsApp

Invia il link a lei con la sua password. Al primo accesso la pagina chiede **"Come ti chiami?"**, poi resta collegata.

Consiglio: dal browser del telefono usate **Aggiungi alla schermata Home**, così si apre come un'app.

---

## Da sapere

- **Pausa per inattività:** i progetti Supabase gratuiti vanno in pausa dopo circa 7 giorni senza nessun accesso. Se la pagina non carica più, entra su supabase.com e premi **Restore project**: i dati restano. Aprirla ogni tanto prima del viaggio evita il problema.
- **Spazio:** il piano gratuito offre 1 GB per i file, ben oltre il necessario per i biglietti.
- **Foto iPhone in formato HEIC** non sono accettate: se capita, fai uno screenshot del biglietto e carica quello.
- **Modifiche al codice:** ricarica il file su GitHub (stesso nome) e la pagina si aggiorna da sola in un paio di minuti.
