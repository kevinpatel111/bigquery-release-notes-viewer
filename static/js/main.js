// State management
let releaseNotesData = [];
let currentFilter = 'all';
let searchQuery = '';

// DOM Elements
const elements = {
    btnRefresh: document.getElementById('btn-refresh'),
    syncTime: document.getElementById('sync-time'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    filterChips: document.getElementById('filter-chips'),
    notesFeed: document.getElementById('notes-feed'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    emptyState: document.getElementById('empty-state'),
    btnRetry: document.getElementById('btn-retry'),
    btnResetFilters: document.getElementById('btn-reset-filters'),
    
    // Stats elements
    valTotal: document.getElementById('val-total'),
    valFeatures: document.getElementById('val-features'),
    valAnnouncements: document.getElementById('val-announcements'),
    valIssues: document.getElementById('val-issues'),
    
    // Modal elements
    tweetModal: document.getElementById('tweet-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelTweet: document.getElementById('btn-cancel-tweet'),
    btnShareTweet: document.getElementById('btn-share-tweet'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCountText: document.getElementById('char-count-text'),
    progressCircle: document.getElementById('progress-circle')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    fetchReleaseNotes(false);

    // Setup Event Listeners
    elements.btnRefresh.addEventListener('click', () => fetchReleaseNotes(true));
    elements.btnRetry.addEventListener('click', () => fetchReleaseNotes(true));
    elements.btnResetFilters.addEventListener('click', resetFilters);
    
    // Search listeners
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.btnClearSearch.addEventListener('click', clearSearch);
    
    // Filter chip listeners
    elements.filterChips.addEventListener('click', handleFilterClick);
    
    // Tweet Modal listeners
    elements.btnCloseModal.addEventListener('click', closeTweetModal);
    elements.btnCancelTweet.addEventListener('click', closeTweetModal);
    elements.btnShareTweet.addEventListener('click', publishTweet);
    elements.tweetTextarea.addEventListener('input', updateCharCount);
    
    // Setup modal backdrop click to close
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            closeTweetModal();
        }
    });
});

/**
 * Fetch release notes from backend API
 * @param {boolean} forceRefresh - If true, bypasses server cache
 */
async function fetchReleaseNotes(forceRefresh = false) {
    showState('loading');
    elements.btnRefresh.classList.add('loading');
    elements.btnRefresh.disabled = true;
    
    try {
        const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            releaseNotesData = result.data;
            
            // Format and update sync time
            if (result.timestamp) {
                const fetchDate = new Date(result.timestamp);
                elements.syncTime.textContent = fetchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } else {
                elements.syncTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            // Calculate and populate stats cards
            calculateStats(releaseNotesData);
            
            // Render filtered feed
            renderReleaseNotes();
        } else {
            throw new Error(result.message || 'Unknown server error');
        }
        
    } catch (error) {
        console.error('Error fetching release notes:', error);
        elements.errorMessage.textContent = `Error details: ${error.message}. Please try again later.`;
        showState('error');
    } finally {
        elements.btnRefresh.classList.remove('loading');
        elements.btnRefresh.disabled = false;
    }
}

/**
 * Calculates metrics and updates stats cards dashboard
 * @param {Array} entries 
 */
function calculateStats(entries) {
    let totalItems = 0;
    let featuresCount = 0;
    let announcementsCount = 0;
    let issuesCount = 0;
    
    entries.forEach(entry => {
        entry.items.forEach(item => {
            totalItems++;
            const type = item.type.toLowerCase();
            if (type.includes('feature')) {
                featuresCount++;
            } else if (type.includes('announcement')) {
                announcementsCount++;
            } else if (type.includes('issue') || type.includes('restore')) {
                issuesCount++;
            }
        });
    });
    
    elements.valTotal.textContent = totalItems;
    elements.valFeatures.textContent = featuresCount;
    elements.valAnnouncements.textContent = announcementsCount;
    elements.valIssues.textContent = issuesCount;
}

/**
 * Render release notes based on current filters and search query
 */
function renderReleaseNotes() {
    elements.notesFeed.innerHTML = '';
    
    let activeEntries = [];
    
    // Filter logic
    releaseNotesData.forEach(entry => {
        // Clone items array to avoid modifying original state
        const matchingItems = entry.items.filter(item => {
            // Check category filter
            if (currentFilter !== 'all') {
                if (item.type.toLowerCase() !== currentFilter.toLowerCase()) {
                    return false;
                }
            }
            
            // Check search text filter
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                const itemTextMatches = item.text.toLowerCase().includes(searchLower);
                const itemTypeMatches = item.type.toLowerCase().includes(searchLower);
                const dateMatches = entry.date.toLowerCase().includes(searchLower);
                
                return itemTextMatches || itemTypeMatches || dateMatches;
            }
            
            return true;
        });
        
        if (matchingItems.length > 0) {
            activeEntries.push({
                ...entry,
                items: matchingItems
            });
        }
    });
    
    // Check if feed is empty after filtering
    if (activeEntries.length === 0) {
        showState('empty');
        return;
    }
    
    showState('feed');
    
    // Build feed HTML
    activeEntries.forEach(entry => {
        const dateGroup = document.createElement('section');
        dateGroup.className = 'date-group';
        
        // Formulate a standardized machine date (YYYY-MM-DD) from title if possible or update timestamp
        let isoDateStr = '';
        try {
            isoDateStr = entry.updated.split('T')[0];
        } catch(e) {
            isoDateStr = 'Recent';
        }
        
        // HTML Structure for Left Column (Sticky Date Info)
        const dateCol = `
            <div class="date-header-column">
                <div class="date-sticky-wrapper">
                    <h2 class="date-title">${entry.date}</h2>
                    <span class="date-subtitle">${isoDateStr}</span>
                </div>
            </div>
        `;
        
        // Build right column (Release Cards)
        let cardsHtml = '';
        entry.items.forEach(item => {
            const cardClass = getCardClassByType(item.type);
            const tagClass = getTagClassByType(item.type);
            const categoryIcon = getCategoryIconByType(item.type);
            
            cardsHtml += `
                <div class="release-card ${cardClass}">
                    <div class="release-card-header">
                        <span class="category-tag ${tagClass}">
                            <i class="${categoryIcon}"></i> ${item.type}
                        </span>
                        <div class="card-actions">
                            <button class="btn-card-tweet" data-date="${entry.date}" data-type="${item.type}" data-url="${entry.url}" aria-label="Compose Tweet about this update">
                                <i class="fa-brands fa-x-twitter"></i> Tweet
                            </button>
                            <a href="${entry.url}" target="_blank" rel="noopener noreferrer" class="btn-card-link" title="Open Release Page" aria-label="Open source link in a new tab">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </a>
                        </div>
                    </div>
                    <div class="release-card-body">
                        ${item.html}
                    </div>
                </div>
            `;
        });
        
        const itemsCol = `
            <div class="release-items-column">
                ${cardsHtml}
            </div>
        `;
        
        dateGroup.innerHTML = dateCol + itemsCol;
        elements.notesFeed.appendChild(dateGroup);
    });
    
    // Bind click listeners to dynamically rendered Tweet buttons
    document.querySelectorAll('.btn-card-tweet').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            const date = btnEl.getAttribute('data-date');
            const type = btnEl.getAttribute('data-type');
            const url = btnEl.getAttribute('data-url');
            
            // Get release text (we retrieve from sibling release-card-body)
            const card = btnEl.closest('.release-card');
            const bodyEl = card.querySelector('.release-card-body');
            const textContent = bodyEl.textContent || bodyEl.innerText || '';
            
            openTweetModal(date, type, url, textContent);
        });
    });
}

/**
 * Style classes map based on release item type
 */
function getCardClassByType(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'card-feature';
    if (t.includes('announcement')) return 'card-announcement';
    if (t.includes('issue') || t.includes('restore')) return 'card-issue';
    if (t.includes('deprecation')) return 'card-deprecation';
    return 'card-update';
}

function getTagClassByType(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'tag-feature';
    if (t.includes('announcement')) return 'tag-announcement';
    if (t.includes('issue') || t.includes('restore')) return 'tag-issue';
    if (t.includes('deprecation')) return 'tag-deprecation';
    return 'tag-update';
}

function getCategoryIconByType(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'fa-solid fa-wand-magic-sparkles';
    if (t.includes('announcement')) return 'fa-solid fa-bullhorn';
    if (t.includes('issue') || t.includes('restore')) return 'fa-solid fa-circle-exclamation';
    if (t.includes('deprecation')) return 'fa-solid fa-ban';
    return 'fa-solid fa-circle-info';
}

/**
 * Handle search bar input events
 */
function handleSearchInput(e) {
    searchQuery = e.target.value;
    
    // Show clear icon if search is active
    if (searchQuery.length > 0) {
        elements.btnClearSearch.style.display = 'block';
    } else {
        elements.btnClearSearch.style.display = 'none';
    }
    
    renderReleaseNotes();
}

/**
 * Clear search state
 */
function clearSearch() {
    elements.searchInput.value = '';
    searchQuery = '';
    elements.btnClearSearch.style.display = 'none';
    renderReleaseNotes();
}

/**
 * Handle filter chips clicks
 */
function handleFilterClick(e) {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    
    // Remove active class from peers
    elements.filterChips.querySelectorAll('.filter-chip').forEach(el => {
        el.classList.remove('active');
    });
    
    // Mark clicked active
    chip.classList.add('active');
    
    currentFilter = chip.getAttribute('data-filter');
    renderReleaseNotes();
}

/**
 * Reset both search input and filter chips
 */
function resetFilters() {
    clearSearch();
    
    // Activate the 'All' chip
    elements.filterChips.querySelectorAll('.filter-chip').forEach(el => {
        if (el.getAttribute('data-filter') === 'all') {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    currentFilter = 'all';
    renderReleaseNotes();
}

/**
 * Show state layouts (loading, feed, error, empty)
 */
function showState(state) {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.notesFeed.classList.add('hidden');
    
    if (state === 'loading') {
        elements.loadingState.classList.remove('hidden');
    } else if (state === 'error') {
        elements.errorState.classList.remove('hidden');
    } else if (state === 'empty') {
        elements.emptyState.classList.remove('hidden');
    } else if (state === 'feed') {
        elements.notesFeed.classList.remove('hidden');
    }
}

// ==========================================
// TWITTER / X MODAL & SHARING WORKFLOW
// ==========================================

const TWEET_LIMIT = 280;
const CIRCLE_RADIUS = 10;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// Set initial circumference values on progress ring SVG
if (elements.progressCircle) {
    elements.progressCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
    elements.progressCircle.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;
}

/**
 * Open Modal and load draft tweet
 */
function openTweetModal(date, type, url, releaseText) {
    // Format a high quality tweet
    // Limit preview summary to 160 characters to leave space for title, links and hashtags
    const cleanText = releaseText.replace(/\s+/g, ' ').trim();
    let snippet = cleanText;
    
    // Clean up markdown style tags inside raw text if bs4 text left any artifact
    snippet = snippet.replace(/[\[\]\(\)\*]/g, '');
    
    const maxSnippetLength = 160;
    if (snippet.length > maxSnippetLength) {
        snippet = snippet.substring(0, maxSnippetLength) + '...';
    }
    
    // Generate draft
    const draft = `BigQuery Release Update (${date})\n📢 ${type}: "${snippet}"\n\nFull details: ${url}\n#BigQuery #GoogleCloud`;
    
    elements.tweetTextarea.value = draft;
    elements.tweetModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Stop scrolling behind modal
    
    updateCharCount();
    
    // Focus textarea
    setTimeout(() => {
        elements.tweetTextarea.focus();
    }, 100);
}

/**
 * Close tweet compose modal
 */
function closeTweetModal() {
    elements.tweetModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
    elements.tweetTextarea.value = '';
}

/**
 * Update Tweet character count indicators dynamically
 */
function updateCharCount() {
    const textLength = elements.tweetTextarea.value.length;
    const remaining = TWEET_LIMIT - textLength;
    
    elements.charCountText.textContent = remaining;
    
    // Update progress ring offset
    const offset = CIRCLE_CIRCUMFERENCE - (Math.min(textLength, TWEET_LIMIT) / TWEET_LIMIT) * CIRCLE_CIRCUMFERENCE;
    elements.progressCircle.style.strokeDashoffset = offset;
    
    // Color states depending on limits
    if (remaining < 0) {
        // Exceeded limit
        elements.charCountText.className = 'char-count-text danger';
        elements.progressCircle.style.stroke = '#f43f5e';
        elements.btnShareTweet.disabled = true;
        elements.btnShareTweet.style.opacity = '0.5';
        elements.btnShareTweet.style.pointerEvents = 'none';
    } else if (remaining <= 20) {
        // Nearing limit
        elements.charCountText.className = 'char-count-text warn';
        elements.progressCircle.style.stroke = '#f59e0b';
        elements.btnShareTweet.disabled = false;
        elements.btnShareTweet.style.opacity = '1';
        elements.btnShareTweet.style.pointerEvents = 'auto';
    } else {
        // Good status
        elements.charCountText.className = 'char-count-text';
        elements.progressCircle.style.stroke = '#1d9bf0';
        elements.btnShareTweet.disabled = false;
        elements.btnShareTweet.style.opacity = '1';
        elements.btnShareTweet.style.pointerEvents = 'auto';
    }
}

/**
 * Open Twitter Web Intent URL to post tweet
 */
function publishTweet() {
    const tweetText = elements.tweetTextarea.value;
    if (tweetText.length > TWEET_LIMIT) return;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(intentUrl, '_blank');
    
    closeTweetModal();
}
