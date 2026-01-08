// ═══════════════════════════════════════════════════════════════════════════
// PUMPFOLIO - Dashboard Script
// ═══════════════════════════════════════════════════════════════════════════

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  CONFIGURE YOUR OVH SERVER URL HERE                                     │
// │  Example: 'https://your-ovh-server.com' or 'http://123.45.67.89:3000'  │
// └─────────────────────────────────────────────────────────────────────────┘
const API_BASE = 'https://your-cloudflare-tunnel.trycloudflare.com';

// ═══════════════════════════════════════════════════════════════════════════

let currentMint = '';
let refreshInterval = null;
let countdownInterval = null;
let nextCycleAt = null;

// DOM Elements
const caDisplay = document.getElementById('ca-display');
const copyCaBtn = document.getElementById('copy-ca-btn');
const chartContainer = document.getElementById('chart-container');
const totalSolEl = document.getElementById('total-sol');
const cyclesEl = document.getElementById('cycles');
const eligibleHoldersEl = document.getElementById('eligible-holders');
const memecoinsCountEl = document.getElementById('memecoins-count');
const tokenNameEl = document.getElementById('token-name');
const tokenPriceEl = document.getElementById('token-price');
const distributionHistoryEl = document.getElementById('distribution-history');
const memecoinsList = document.getElementById('memecoins-list');
const minTokensEl = document.getElementById('min-tokens');
const minCyclesEl = document.getElementById('min-cycles');
const intervalEl = document.getElementById('interval');
const coinsBadge = document.getElementById('coins-badge');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('💼 Pumpfolio Dashboard Loaded');
  console.log('📡 API Server:', API_BASE);
  
  // Show welcome popup (if not dismissed before)
  initWelcomePopup();
  
  // Check if API is configured
  if (API_BASE.includes('your-') || API_BASE === '') {
    showWaitingState();
    return;
  }
  
  // Load initial data
  await loadConfig();
  await fetchStats();
  await fetchMemecoins();
  
  // Set up auto-refresh
  refreshInterval = setInterval(async () => {
    await fetchStats();
  }, 10000);
  
  // Set up countdown timer
  countdownInterval = setInterval(updateCountdown, 1000);
  
  // Copy CA button
  copyCaBtn.addEventListener('click', copyCA);
  caDisplay.addEventListener('click', copyCA);
  
  // Load chart if CA is configured
  if (currentMint) {
    loadChart();
  }
});

// Welcome Popup
function initWelcomePopup() {
  const popup = document.getElementById('welcome-popup');
  const closeBtn = document.getElementById('popup-close-btn');
  const dontShowCheckbox = document.getElementById('dont-show-again');
  
  if (!popup || !closeBtn) return;
  
  // Check if user dismissed before
  const dismissed = localStorage.getItem('pumpfolio-popup-dismissed');
  if (dismissed === 'true') {
    popup.classList.add('hidden');
    return;
  }
  
  // Close button handler
  closeBtn.addEventListener('click', () => {
    popup.classList.add('hidden');
    
    // Save preference if checkbox is checked
    if (dontShowCheckbox && dontShowCheckbox.checked) {
      localStorage.setItem('pumpfolio-popup-dismissed', 'true');
    }
  });
  
  // Close on overlay click (outside modal)
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      popup.classList.add('hidden');
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popup.classList.contains('hidden')) {
      popup.classList.add('hidden');
    }
  });
}

function showWaitingState() {
  caDisplay.textContent = 'Configure API_BASE in script.js';
  chartContainer.innerHTML = `
    <div class="loading-state">
      <p>📡 Waiting for API connection</p>
      <p style="font-size: 0.75rem; margin-top: 10px; color: var(--text-muted);">
        Update API_BASE in script.js with your server URL
      </p>
    </div>
  `;
  memecoinsList.innerHTML = `
    <div class="loading-state">
      <p>Waiting for server...</p>
    </div>
  `;
  
}

// Load configuration from server
async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    const config = await response.json();
    
    if (config.tokenMint) {
      currentMint = config.tokenMint;
      caDisplay.textContent = currentMint;
    } else {
      caDisplay.textContent = 'Starting server...';
    }
    
    // Update eligibility requirements
    if (config.minTokensToQualify) {
      minTokensEl.textContent = formatNumber(config.minTokensToQualify);
    }
    if (config.minConsecutiveCycles !== undefined) {
      minCyclesEl.textContent = config.minConsecutiveCycles;
    }
    if (config.intervalSeconds) {
      intervalEl.textContent = formatInterval(config.intervalSeconds);
    }
    
  } catch (e) {
    console.error('Failed to load config:', e);
    caDisplay.textContent = 'Connecting...';
  }
}

// Copy CA to clipboard
async function copyCA() {
  if (!currentMint) return;
  
  try {
    await navigator.clipboard.writeText(currentMint);
    copyCaBtn.classList.add('copied');
    
    setTimeout(() => {
      copyCaBtn.classList.remove('copied');
    }, 2000);
  } catch (e) {
    console.error('Failed to copy:', e);
  }
}

// Fetch stats from server
async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    const stats = await response.json();
    
    // Update main stats
    animateValue(totalSolEl, stats.totalFeesCollected?.toFixed(4) || '0.00');
    animateValue(cyclesEl, (stats.cycles || 0).toString());
    animateValue(eligibleHoldersEl, (stats.eligibleHolders || 0).toString());
    animateValue(memecoinsCountEl, (stats.memecoinsCount || 0).toString());
    
    // Update countdown
    if (stats.nextCycleAt) {
      nextCycleAt = stats.nextCycleAt;
      updateCountdown();
    }
    
    // Update token info
    if (stats.tokenMint && !currentMint) {
      currentMint = stats.tokenMint;
      caDisplay.textContent = currentMint;
      loadChart();
    }
    
    // Update token price
    if (stats.currentTokenPrice) {
      tokenPriceEl.textContent = '$' + formatPrice(stats.currentTokenPrice);
    }
    if (stats.tokenSymbol && stats.tokenSymbol !== 'UNKNOWN') {
      tokenNameEl.textContent = stats.tokenSymbol;
    }
    
    // Fetch cycle history
    await fetchCycleHistory();
    
  } catch (e) {
    console.error('Failed to fetch stats:', e);
  }
}

// Fetch memecoins list with ticker, name, and market cap
async function fetchMemecoins() {
  try {
    const response = await fetch(`${API_BASE}/api/memecoins`);
    const data = await response.json();
    
    if (data.coins && data.coins.length > 0) {
      if (coinsBadge) coinsBadge.textContent = `${data.coins.length} coins`;
      
      // Render memecoin grid with images and copy button
      memecoinsList.innerHTML = data.coins.map((coin, i) => `
        <div class="memecoin-item">
          <div class="memecoin-info">
            <span class="memecoin-rank">${i + 1}</span>
            ${coin.image ? `<img src="${coin.image}" alt="${coin.symbol}" class="memecoin-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">` : ''}<span class="memecoin-icon-placeholder" ${coin.image ? 'style="display:none"' : ''}>🪙</span>
            <div class="memecoin-details">
              <div class="memecoin-symbol">${coin.symbol || '???'}</div>
              <div class="memecoin-name">${coin.name || coin.mint.slice(0, 12) + '...'}</div>
            </div>
          </div>
          <div class="memecoin-actions">
            <span class="memecoin-mc">${coin.marketCap ? formatMarketCap(coin.marketCap) : '---'}</span>
            <button class="copy-ca-btn" data-ca="${coin.mint}" title="Copy CA">📋</button>
          </div>
        </div>
      `).join('');
      
      // Add click handlers for copy buttons
      document.querySelectorAll('.copy-ca-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ca = btn.dataset.ca;
          try {
            await navigator.clipboard.writeText(ca);
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = '📋', 1500);
          } catch (err) {
            console.error('Copy failed:', err);
          }
        });
      });
    } else {
      memecoinsList.innerHTML = `
        <div class="loading-state">
          <p>No memecoins configured</p>
          <p style="font-size: 0.7rem; color: var(--text-muted);">Add MEMECOIN_1, MEMECOIN_2... to .env</p>
        </div>
      `;
    }
  } catch (e) {
    console.error('Failed to fetch memecoins:', e);
    memecoinsList.innerHTML = `
      <div class="loading-state">
        <p>Waiting for server...</p>
      </div>
    `;
  }
}

// Fetch cycle history
async function fetchCycleHistory() {
  try {
    const response = await fetch(`${API_BASE}/api/distributions`);
    const data = await response.json();
    
    if (data.distributions && data.distributions.length > 0) {
      distributionHistoryEl.innerHTML = data.distributions
        .reverse()
        .slice(0, 20)
        .map(dist => `
          <tr>
            <td>${formatTime(dist.timestamp)}</td>
            <td>${dist.solSpent?.toFixed(4) || '0'} ◎</td>
            <td>$${formatUSD(dist.usdValue || 0)}</td>
            <td>${dist.coinsCount || 0}</td>
            <td>${dist.recipientsCount || 0}</td>
          </tr>
        `)
        .join('');
    }
  } catch (e) {
    console.error('Failed to fetch cycle history:', e);
  }
}

// Update countdown timer
function updateCountdown() {
  const countdownEl = document.getElementById('countdown');
  if (!countdownEl || !nextCycleAt) {
    if (countdownEl) countdownEl.textContent = '--:--';
    return;
  }
  
  const now = Date.now();
  const diff = nextCycleAt - now;
  
  if (diff <= 0) {
    countdownEl.textContent = 'NOW!';
    countdownEl.style.color = 'var(--success)';
    return;
  }
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  countdownEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  countdownEl.style.color = '';
}

// Load DexScreener chart
async function loadChart() {
  if (!currentMint) {
    chartContainer.innerHTML = `
      <div class="loading-state">
        <p>Waiting for token...</p>
      </div>
    `;
    return;
  }
  
  // Show loading
  chartContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading chart...</span>
    </div>
  `;
  
  // Fetch token info
  try {
    const response = await fetch(`${API_BASE}/api/token/${currentMint}`);
    const data = await response.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      tokenNameEl.textContent = pair.baseToken?.symbol || '---';
      tokenPriceEl.textContent = '$' + formatPrice(parseFloat(pair.priceUsd || 0));
    } else {
      tokenNameEl.textContent = currentMint.slice(0, 8) + '...';
    }
  } catch (e) {
    console.error('Failed to fetch token info:', e);
    tokenNameEl.textContent = currentMint.slice(0, 8) + '...';
  }
  
  // Embed DexScreener chart
  chartContainer.innerHTML = `
    <iframe 
      src="https://dexscreener.com/solana/${currentMint}?embed=1&theme=dark&info=0&trades=0"
      title="DexScreener Chart"
      loading="lazy"
    ></iframe>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatMarketCap(num) {
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
  return '$' + num.toFixed(0);
}

function formatUSD(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function formatPrice(num) {
  if (num < 0.000001) return num.toExponential(2);
  if (num < 0.01) return num.toFixed(8);
  if (num < 1) return num.toFixed(6);
  return num.toFixed(2);
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = (now - date) / 1000;
  
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function formatInterval(seconds) {
  if (seconds >= 3600) return Math.floor(seconds / 3600) + 'h';
  if (seconds >= 60) return Math.floor(seconds / 60) + 'm';
  return seconds + 's';
}

function animateValue(element, newValue) {
  if (!element) return;
  if (element.textContent !== newValue) {
    element.classList.add('updating');
    element.textContent = newValue;
    setTimeout(() => {
      element.classList.remove('updating');
    }, 300);
  }
}

// Debug helper
window.pumpfolioDebug = {
  fetchStats,
  fetchMemecoins,
  loadChart,
  currentMint: () => currentMint
};
