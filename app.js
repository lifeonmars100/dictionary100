document.addEventListener('DOMContentLoaded', () => {
    // ----- DOM 요소 (변경 없음) -----
    const views = { setup: document.getElementById('setup-view'), main: document.getElementById('main-view'), detail: document.getElementById('detail-view') };
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatusText = document.getElementById('loading-status-text');
    const searchInput = document.getElementById('search-input');
    // ... (이하 모든 DOM 요소는 변경 없음)
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const searchBtn = document.getElementById('search-btn');
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const wordListContainer = document.getElementById('word-list-container');
    const backButton = document.getElementById('back-button');
    const flashcard = document.querySelector('.flashcard');
    const flashcardFront = document.getElementById('flashcard-front');
    const flashcardBack = document.getElementById('flashcard-back');
    const flashcardEng = document.getElementById('flashcard-eng');
    const flashcardKor = document.getElementById('flashcard-kor');
    const speakButton = document.getElementById('speak-button');
    const favoriteButton = document.getElementById('favorite-button');
    const settingsBtn = document.getElementById('settings-btn');
    const favoritesListBtn = document.getElementById('favorites-list-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const resetDataBtn = document.getElementById('reset-data-btn');
    const fileInput = document.getElementById('file-input');
    const setupStatus = document.getElementById('setup-status');
    const increaseFontBtn = document.getElementById('increase-font-btn');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');
    const fontSizeDisplay = document.getElementById('font-size-display');
    const toast = document.getElementById('toast');
    const wordCountDisplay = document.getElementById('word-count-display');
    
    // ----- 상태 변수 (변경 없음) -----
    let db, currentWord = null, favorites = JSON.parse(localStorage.getItem('favorites')) || [], currentFontSize = parseInt(localStorage.getItem('fontSize')) || 16, isFavoritesView = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // ----- 상수 (변경 없음) -----
    const DB_NAME = "MyDictionaryDB", STORE_NAME = "words", DB_VERSION = 3;

    // ----- 뷰 관리 (변경 없음) -----
    function showView(viewName) { Object.values(views).forEach(v => v.classList.add('hidden')); views[viewName].classList.remove('hidden'); }
    
    // ★★★★★ [최종 논리] 통합 한국어 필드 해석기 (데이터 이중성 인지) ★★★★★
    const KNOWN_PARTS_OF_SPEECH = new Set(['n', 'v', 'vi', 'vt', 'a', 'ad', 'adj', 'pron', 'prep', 'conj', 'x', 'xconj']);
    const POS_PATTERN = /^[a-z]+$/;
    const ENGLISH_MEANING_PATTERN = /[a-zA-Z]{5,}/; // 5글자 이상 영어 단어가 있으면 '영어 뜻'으로 간주

    function parseKoreanField(koreanStr) {
        if (!koreanStr) return { pos: [], meanings: '', meaningType: 'korean' };
        
        const tokens = koreanStr.split(/[, ]+/).filter(t => t);
        let boundaryIndex = 0;
        for (const token of tokens) {
            if (POS_PATTERN.test(token) && KNOWN_PARTS_OF_SPEECH.has(token)) {
                boundaryIndex++;
            } else {
                break;
            }
        }
        
        const pos = tokens.slice(0, boundaryIndex);
        let meanings = '';
        if (boundaryIndex < tokens.length) {
            const firstMeaningToken = tokens[boundaryIndex];
            const firstMeaningIndex = koreanStr.indexOf(firstMeaningToken);
            if (firstMeaningIndex !== -1) {
                meanings = koreanStr.substring(firstMeaningIndex).trim();
            }
        }
        
        if (meanings.length === 0 && pos.length > 0) {
            return { pos: [], meanings: koreanStr, meaningType: 'korean' };
        }

        // '뜻' 부분의 타입을 분석하여 반환
        const meaningType = ENGLISH_MEANING_PATTERN.test(meanings) ? 'english' : 'korean';
        
        return { pos, meanings, meaningType };
    }

    // ----- IndexedDB (변경 없음) -----
    function importDataToDB(wordsData) { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); store.clear(); wordsData.forEach(word => { const parsed = parseKoreanField(word.korean); word.searchTags = parsed.meanings.split(/[,/]/).map(tag => tag.trim()).filter(tag => tag.length > 0); store.add(word); }); tx.oncomplete = () => resolve(); tx.onerror = e => reject("데이터 저장 오류: " + e.target.error); }); }
    
    // ----- UI 렌더링 -----
    function displayWords(words) {
        wordListContainer.innerHTML = '';
        if (words.length === 0) { wordListContainer.innerHTML = `<p class="placeholder">${isFavoritesView ? '즐겨찾기한 단어가 없습니다.' : '검색 결과가 없습니다.'}</p>`; return; }
        
        const fragment = document.createDocumentFragment();
        words.sort((a,b) => a.english.localeCompare(b.english)).forEach(word => {
            const item = document.createElement('div');
            item.className = 'word-item';
            
            const engSpan = document.createElement('span');
            engSpan.className = 'word-item-eng';
            engSpan.textContent = word.english; // 원본 그대로!
            item.appendChild(engSpan);

            const parsed = parseKoreanField(word.korean);
            if (parsed.pos.length > 0) {
                const posSpan = document.createElement('span');
                posSpan.className = 'word-item-pos';
                posSpan.textContent = `(${parsed.pos.join(', ')})`;
                item.appendChild(posSpan);
            }

            const korSpan = document.createElement('span');
            korSpan.className = 'word-item-kor';
            
            const summary = parsed.meanings.length > 40 ? parsed.meanings.substring(0, 40) + '...' : parsed.meanings;
            
            // 데이터 타입에 따라 다른 내용을 표시
            if (parsed.meaningType === 'english') {
                korSpan.innerHTML = `→ <span style="font-style: italic;">${summary}</span>`;
            } else {
                korSpan.textContent = summary;
            }
            item.appendChild(korSpan);

            item.addEventListener('click', () => showDetailView(word));
            fragment.appendChild(item);
        });
        wordListContainer.appendChild(fragment);
    }
    
    function showDetailView(word) {
        currentWord = word;
        flashcardEng.textContent = word.english; // 원본 그대로!
        const parsed = parseKoreanField(word.korean);
        const posText = parsed.pos.length > 0 ? `(${parsed.pos.join(', ')})\n` : '';
        flashcardKor.textContent = posText + parsed.meanings;
        
        flashcard.classList.remove('flipped'); updateFavoriteButton(); showView('detail');
        flashcardFront.scrollTop = 0; flashcardBack.scrollTop = 0;
        history.pushState({ view: 'detail' }, '', `#word`);
    }

    // ★★★★★ [철칙 준수] TTS는 영어 파트 전체를 읽습니다. ★★★★★
    speakButton.addEventListener('click', () => {
        if (currentWord && 'speechSynthesis' in window) {
            const wordToSpeak = currentWord.english;
            const utterance = new SpeechSynthesisUtterance(wordToSpeak);
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    });

    // ----- 나머지 모든 함수는 기존 기능 그대로 유지됩니다 -----
    function searchWords(term) { const searchTerms = term.trim().split(/\s+/).filter(t => t); if (searchTerms.length === 0) return Promise.resolve([]); const promises = searchTerms.map(singleTerm => singleTermSearch(singleTerm)); return Promise.all(promises).then(resultsArrays => { const combinedResults = new Map(); resultsArrays.forEach(arr => { arr.forEach(word => combinedResults.set(word.id, word)); }); return Array.from(combinedResults.values()); }); }
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, DB_VERSION); request.onerror = e => reject("DB 열기 오류: " + e.target.errorCode); request.onsuccess = e => { db = e.target.result; resolve(db); }; request.onupgradeneeded = e => { const db = e.target.result; let store; if (!db.objectStoreNames.contains(STORE_NAME)) { store = db.createObjectStore(STORE_NAME, { keyPath: "id" }); } else { store = e.target.transaction.objectStore(STORE_NAME); } if (!store.indexNames.contains('english_idx')) { store.createIndex("english_idx", "english", { unique: false }); } if (!store.indexNames.contains('korean_idx')) { store.createIndex("korean_idx", "korean", { unique: false }); } if (!store.indexNames.contains('searchTags_idx')) { store.createIndex("searchTags_idx", "searchTags", { unique: false, multiEntry: true }); } }; }); }
    function singleTermSearch(term) { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const results = new Map(); const searches = [ cursorSearch(store.index("english_idx"), IDBKeyRange.bound(term.toLowerCase(), term.toLowerCase() + '\uffff')), cursorSearch(store.index("korean_idx"), IDBKeyRange.bound(term, term + '\uffff')), cursorSearch(store.index("searchTags_idx"), IDBKeyRange.only(term)) ]; Promise.all(searches).then(allFoundWords => { allFoundWords.forEach(foundWords => { foundWords.forEach(word => results.set(word.id, word)); }); resolve(Array.from(results.values())); }).catch(reject); }); }
    function cursorSearch(index, range) { return new Promise((resolve, reject) => { const foundWords = []; const request = index.openCursor(range); request.onerror = e => reject(e.target.error); request.onsuccess = e => { const cursor = e.target.result; if (cursor) { foundWords.push(cursor.value); cursor.continue(); } else { resolve(foundWords); } }; }); }
    fileInput.addEventListener('change', (event) => { const file = event.target.files[0]; if (!file) return; loadingOverlay.classList.remove('hidden'); loadingStatusText.textContent = '파일을 읽는 중입니다...'; setupStatus.textContent = ''; const reader = new FileReader(); reader.onload = async (e) => { try { const wordsData = JSON.parse(e.target.result); loadingStatusText.textContent = `총 ${wordsData.length.toLocaleString()}개의 단어를 저장 중입니다...`; await importDataToDB(wordsData); setupStatus.textContent = '✅ 설정 완료!'; setTimeout(() => { location.reload(); }, 1500); } catch (err) { setupStatus.textContent = '오류: 올바른 JSON 파일이 아닙니다.'; alert("파일 처리 오류: " + err); loadingOverlay.classList.add('hidden'); } }; reader.onerror = () => { setupStatus.textContent = '파일을 읽는 데 실패했습니다.'; loadingOverlay.classList.add('hidden'); }; reader.readAsText(file); });
    function checkDBStatus() { return new Promise((resolve) => { if (!db) { resolve(false); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const countReq = store.count(); countReq.onsuccess = () => resolve(countReq.result > 0); countReq.onerror = () => resolve(false); }); }
    function clearDB() { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const req = store.clear(); req.onsuccess = () => resolve(); req.onerror = e => reject("DB 초기화 오류: " + e.target.error); }); }
    function getWordCount() { return new Promise((resolve) => { if (!db) { resolve(0); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const countReq = store.count(); countReq.onsuccess = () => resolve(countReq.result); countReq.onerror = () => resolve(0); }); }
    function getWordsByIds(ids) { return new Promise((resolve) => { if (!db || ids.length === 0) { resolve([]); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const results = []; let processed = 0; ids.forEach(id => { const req = store.get(id); req.onsuccess = () => { if (req.result) results.push(req.result); processed++; if (processed === ids.length) resolve(results); }; }); }); }
    function updateFavoriteButton() { if (favorites.includes(currentWord.id)) { favoriteButton.classList.add('favorited'); favoriteButton.innerHTML = '<i class="fas fa-star"></i>'; } else { favoriteButton.classList.remove('favorited'); favoriteButton.innerHTML = '<i class="far fa-star"></i>'; } }
    function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 2000); }
    function applyFontSize() { document.documentElement.style.fontSize = `${currentFontSize}px`; fontSizeDisplay.textContent = `${currentFontSize}px`; localStorage.setItem('fontSize', currentFontSize); }
    async function performSearch() { if(isFavoritesView) { isFavoritesView = false; favoritesListBtn.classList.remove('active'); } const term = searchInput.value; const words = await searchWords(term); displayWords(words); }
    searchInput.addEventListener('input', () => clearSearchBtn.classList.toggle('hidden', searchInput.value.length === 0));
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    clearSearchBtn.addEventListener('click', () => { searchInput.value = ''; clearSearchBtn.classList.add('hidden'); if(!isFavoritesView) wordListContainer.innerHTML = `<p class="placeholder">검색어를 입력하여 단어를 찾아보세요.</p>`; });
    searchBtn.addEventListener('click', performSearch);
    if (SpeechRecognition) { voiceSearchBtn.addEventListener('click', () => { const recognition = new SpeechRecognition(); recognition.lang = 'ko-KR'; recognition.onresult = (event) => { let transcript = event.results[0][0].transcript; if (transcript.endsWith('.')) { transcript = transcript.slice(0, -1); } searchInput.value = transcript; clearSearchBtn.classList.remove('hidden'); performSearch(); }; recognition.start(); }); } else { voiceSearchBtn.style.display = 'none'; }
    backButton.addEventListener('click', () => { history.back(); });
    flashcard.addEventListener('click', () => flashcard.classList.toggle('flipped'));
    favoriteButton.addEventListener('click', () => { const wordId = currentWord.id; const index = favorites.indexOf(wordId); if (index > -1) { favorites.splice(index, 1); showToast('즐겨찾기에서 삭제되었습니다.'); } else { favorites.push(wordId); showToast('즐겨찾기에 추가되었습니다.'); } localStorage.setItem('favorites', JSON.stringify(favorites)); updateFavoriteButton(); });
    favoritesListBtn.addEventListener('click', async () => { isFavoritesView = !isFavoritesView; favoritesListBtn.classList.toggle('active', isFavoritesView); searchInput.value = ''; clearSearchBtn.classList.add('hidden'); if (isFavoritesView) { const favoriteWords = await getWordsByIds(favorites); displayWords(favoriteWords); } else { wordListContainer.innerHTML = `<p class="placeholder">검색어를 입력하여 단어를 찾아보세요.</p>`; } });
    settingsBtn.addEventListener('click', async () => { const count = await getWordCount(); wordCountDisplay.textContent = `${count.toLocaleString()}개 단어`; settingsModal.classList.remove('hidden'); });
    closeModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });
    resetDataBtn.addEventListener('click', async () => { if (confirm('정말로 모든 단어와 즐겨찾기 데이터를 삭제하시겠습니까?')) { try { await clearDB(); localStorage.clear(); showToast('모든 데이터가 초기화되었습니다.'); location.reload(); } catch (error) { alert(error); } } });
    increaseFontBtn.addEventListener('click', () => { currentFontSize = Math.min(45, currentFontSize + 1); applyFontSize(); });
    decreaseFontBtn.addEventListener('click', () => { currentFontSize = Math.max(12, currentFontSize - 1); applyFontSize(); });
    async function init() {
        applyFontSize();
        try {
            await openDB();
            const isDataReady = await checkDBStatus();
            if (isDataReady) { showView('main'); } else { showView('setup'); }
            history.replaceState({ view: 'main' }, '', location.pathname);
        } catch (error) {
            alert("앱 초기화 오류: " + error);
            document.body.innerHTML = "<h1>앱 로딩 실패</h1><p>앱 데이터를 초기화하고 다시 시도해주세요.</p>";
        }
    }
    window.addEventListener('popstate', async (event) => { if (!event.state || event.state.view === 'main') { showView('main'); if (isFavoritesView) { const favoriteWords = await getWordsByIds(favorites); displayWords(favoriteWords); } } });
    init();
});