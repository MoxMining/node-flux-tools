const API_URL = "https://explorer.runonflux.io/api/status";

const BLOCK_TIME_SECONDS = 30;

// --- Pa-supplys konstanter ---
const PA_PER_CHAIN = 2449214.05009;      // Remaining per PA chain (whitepaper)
const NUM_PA_CHAINS = 10;                // Antall PA chains
const TOTAL_PA_SUPPLY = PA_PER_CHAIN * NUM_PA_CHAINS;  // 24 492 140,5009 PA totalt

const PA_RATE_PERIOD_1 = 14.0;           // PA per block (første 10% reduksjon)
const PA_RATE_PERIOD_2 = 12.6;           // PA per block (andre 10% reduksjon)

// --- Halvingskonstanter ---
const THIRD_START = 2020000;             // Blokk 2,020,000 — PoUW v.2 starter
const FOURTH_HALVING = 3071200;          // Blokk 3,071,200 — første 10% reduksjon av base
const PA_DEPLETION = 3824802;           // PA depletion etter beregning med 10 chains
const HALVING_INTERVAL = 1051200;        // 1 år med 30-sekunders blokker
const INITIAL_REWARD = 14;               // 14 Flux base per block

let nextReductionTime = null;

async function fetchCurrentHeight() {
    const res = await fetch(API_URL);
    const data = await res.json();
    return data.info.blocks;
}

function formatDate(date) {
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
}

function estimateDate(currentHeight, targetBlock) {
    const blocksRemaining = targetBlock - currentHeight;
    return new Date(Date.now() + blocksRemaining * BLOCK_TIME_SECONDS * 1000);
}

function calculateCurrentReward(currentHeight) {
    let baseReward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;
    
    while (halvingBlock <= currentHeight) {
        baseReward *= 0.9;
        halvingBlock += HALVING_INTERVAL;
    }
    
    // PA aktive så lenge vi er før PA_DEPLETION
    const paActive = currentHeight < PA_DEPLETION;
    
    // Total reward = base + PA (dersom PA er aktiv)
    // Når PA er aktiv: total = base * 2 (base + PA)
    // Når PA er tom: total = base
    return paActive ? baseReward * 2 : baseReward;
}

// Beregn PA depletion blokk basert på total PA supply og forbruksrate
function calculatePADepletionBlock() {
    // Periode 1: blokk 2,020,000 → 3,071,200 (1,051,200 blokker)
    // PA forbrukt: 1,051,200 × 14 = 14,716,800 PA
    const period1Blocks = FOURTH_HALVING - THIRD_START;  // 1,051,200
    const period1PAUsed = period1Blocks * PA_RATE_PERIOD_1;  // 14,716,800
    
    // Gjenværende PA etter periode 1
    const remainingAfterPeriod1 = TOTAL_PA_SUPPLY - period1PAUsed;  // 6,975,340.5009
    
    // Periode 2: Fortsetter med samme rate inntil PA er tomt
    // Antall blokker til PA er tomt: remainingAfterPeriod1 / PA_RATE_PERIOD_2
    const blocksUntilDepletion = Math.floor(remainingAfterPeriod1 / PA_RATE_PERIOD_2);
    const depletionBlock = THIRD_START + period1Blocks + blocksUntilDepletion;
    
    return {
        depletionBlock,
        remainingAfterPeriod1,
        period1PAUsed,
        period2Blocks: blocksUntilDepletion,
        period2PAUsed: blocksUntilDepletion * PA_RATE_PERIOD_2
    };
}

function generateSchedule(currentHeight) {
    const events = [];
    let baseReward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;
    
    // PA depletion info
    const paInfo = calculatePADepletionBlock();
    
    // Start event (PoUW v.2)
    events.push({
        name: "3rd Period Start (PoUW v.2)",
        block: THIRD_START,
        reward: baseReward * 2,  // Base + PA = 28 FLUX
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY
    });
    
    for (let halving = 4; halving <= 12; halving++) {
        baseReward *= 0.9;
        
        const paActive = halvingBlock < PA_DEPLETION;
        
        // PA-remaining ved dette punktet
        let paRemaining = TOTAL_PA_SUPPLY;
        if (halvingBlock <= FOURTH_HALVING) {
            paRemaining = TOTAL_PA_SUPPLY - (halvingBlock - THIRD_START) * PA_RATE_PERIOD_1;
        } else if (halvingBlock <= PA_DEPLETION) {
            paRemaining = paInfo.remainingAfterPeriod1 - (halvingBlock - FOURTH_HALVING) * PA_RATE_PERIOD_2;
        } else {
            paRemaining = 0;
        }
        
        // 10% reduksjons-event
        events.push({
            name: halving + "th Reduction (−10%)",
            block: halvingBlock,
            reward: paActive ? baseReward * 2 : baseReward,
            baseOnly: !paActive,
            paRemaining: Math.max(0, paRemaining)
        });
        
        // PA depletion event (dersom halvingBlock er nær depletion)
        if (halvingBlock < PA_DEPLETION &&
            PA_DEPLETION < halvingBlock + HALVING_INTERVAL) {
            events.push({
                name: "PA Depletion (PA ends)",
                block: PA_DEPLETION,
                reward: baseReward,
                baseOnly: true,
                paRemaining: 0
            });
        }
        
        halvingBlock += HALVING_INTERVAL;
    }
    
    events.sort((a, b) => a.block - b.block);
    
    // Legg til informasjon om PA depletion beregning
    events.push({
        name: "PA Depletion Calculation",
        block: -1,
        reward: 0,
        baseOnly: false,
        paRemaining: 0,
        paInfo
    });
    
    return events;
}

function startCountdown() {
    setInterval(() => {
        if (!nextReductionTime) return;
        
        const diff = nextReductionTime - new Date();
        if (diff <= 0) return;
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        
        document.getElementById("countdown").innerText =
            `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }, 1000);
}

async function init() {
    const currentHeight = await fetchCurrentHeight();
    
    document.getElementById("currentHeight").innerText =
        currentHeight.toLocaleString();
    
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById("timezoneInfo").innerText =
        "All dates shown in your timezone: " + tz;
    
    const currentReward = calculateCurrentReward(currentHeight);
    document.getElementById("currentReward").innerText =
        currentReward.toFixed(6) + " FLUX";
    
    const events = generateSchedule(currentHeight);
    const table = document.getElementById("scheduleTable");
    table.innerHTML = "";
    
    nextReductionTime = null; // reset before filling
    
    for (let event of events) {
        if (event.block > currentHeight && !nextReductionTime && event.block !== -1) {
            nextReductionTime = estimateDate(currentHeight, event.block);
        }
        
        const row = document.createElement("tr");
        
        const dateDisplay =
            event.block > currentHeight
                ? formatDate(estimateDate(currentHeight, event.block))
                : "Already Passed";
        
        // Spesialhåndtering for PA Depletion Calculation
        let extraInfo = "";
        if (event.name === "PA Depletion Calculation") {
            extraInfo = `
                <tr style="background: #1a1a2e; color: #a0a0a0; font-size: 0.9em;">
                    <td colspan="4" style="padding: 15px; border: none; text-align: left;">
                        <strong>PA Supply Calculation Details:</strong><br>
                        PA per chain (ved blokk 2,020,000): ${PA_PER_CHAIN.toFixed(6)} FLUX × ${NUM_PA_CHAINS} chains = <strong>${TOTAL_PA_SUPPLY.toFixed(6)} FLUX</strong><br>
                        Periode 1 (2,020,000 → 3,071,200): ${paInfo.period1Blocks.toLocaleString()} blokker × ${PA_RATE_PERIOD_1} PA/block = <strong>${paInfo.period1PAUsed.toFixed(6)} FLUX</strong><br>
                        Gjenværende etter periode 1: <strong>${paInfo.remainingAfterPeriod1.toFixed(6)} FLUX</strong><br>
                        Periode 2 (3,071,201 → depletion): ${paInfo.period2Blocks.toLocaleString()} blokker × ${PA_RATE_PERIOD_2} PA/block = <strong>${paInfo.period2PAUsed.toFixed(6)} FLUX</strong><br>
                        <strong>PA depletion block: ${paInfo.depletionBlock.toLocaleString()}</strong>
                    </td>
                </tr>`;
            row.innerHTML = "";
        } else if (event.block === -1) {
            // Skip dette eventet i tabellen
            continue;
        } else {
            row.innerHTML = `
                <td>${event.name}</td>
                <td>${event.block.toLocaleString()}</td>
                <td>${dateDisplay}</td>
                <td>${event.reward.toFixed(6)} FLUX</td>
            `;
        }
        
        if (event.name !== "PA Depletion Calculation") {
            table.appendChild(row);
        }
        
        // Legg til extra info for PA depletion calculation
        if (event.name === "PA Depletion Calculation") {
            table.insertAdjacentHTML('beforeend', extraInfo);
        }
    }
    
    // Find the previous and next events to calculate progress within current cycle
    let previousEvent = events[0];
    let nextEvent = null;
    
    for (let event of events) {
        if (event.block <= currentHeight && event.block !== -1) {
            previousEvent = event;
        } else if (event.block > currentHeight && !nextEvent && event.block !== -1) {
            nextEvent = event;
            break;
        }
    }
    
    const cycleStart = previousEvent.block;
    const cycleEnd = nextEvent.block;
    const blocksInCycle = cycleEnd - cycleStart;
    const blocksPassed = currentHeight - cycleStart;
    const progress = Math.min((blocksPassed / blocksInCycle) * 100, 100);
    
    document.getElementById("progressFill").style.width = progress + "%";
    document.getElementById("progressText").innerText =
        progress.toFixed(2) + "% progress to " + nextEvent.name;
    
    // countdown already running; no need to restart it repeatedly
}

// initial load
init();
startCountdown();

// refresh data every minute without reloading page
setInterval(init, 60000);
