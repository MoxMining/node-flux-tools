const API_URL = "https://explorer.runonflux.io/api/status";

const BLOCK_TIME_SECONDS = 30;

// --- Pa-supplys konstanter ---
const PA_PER_CHAIN = 2449214.05009;
const NUM_PA_CHAINS = 10;
const TOTAL_PA_SUPPLY = PA_PER_CHAIN * NUM_PA_CHAINS;

const PA_RATE_PERIOD_1 = 14.0;
const PA_RATE_PERIOD_2 = 12.6;

// --- Halving constants ---
const THIRD_START = 2020000;
const FOURTH_HALVING = 3071200;
const PA_DEPLETION = 3787502;  // THE CUT — erstatter 3824802
const HALVING_INTERVAL = 1051200;
const INITIAL_REWARD = 14;

function formatDate(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
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
    
    const paActive = currentHeight < PA_DEPLETION;
    return paActive ? baseReward * 2 : baseReward;
}

function generateSchedule(currentHeight) {
    const events = [];
    let baseReward = INITIAL_REWARD;
    
    // 1. PoUW v.2 Start
    events.push({
        name: "PoUW v.2 Start",
        block: THIRD_START,
        reward: baseReward * 2,
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY
    });
    
    // 2. Application spec v9 enforced (INGEN endring)
    events.push({
        name: "Application spec v9 enforced",
        block: 3050000,
        reward: baseReward * 2,
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY - (3050000 - THIRD_START) * PA_RATE_PERIOD_1
    });
    
    // 3. 1st Proof-of-Node reduction (−10%)
    baseReward *= 0.9;
    events.push({
        name: "1st Proof-of-Node reduction (−10%)",
        block: FOURTH_HALVING,
        reward: baseReward * 2,
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY - (FOURTH_HALVING - THIRD_START) * PA_RATE_PERIOD_1
    });
    
    // 4. Retiring chains go one-directional (INGEN endring)
    events.push({
        name: "Retiring chains go one-directional",
        block: 3450000,
        reward: baseReward * 2,
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY - (3450000 - THIRD_START) * PA_RATE_PERIOD_1
    });
    
    // 5. Shielded pools retired (INGEN endring)
    events.push({
        name: "Shielded pools retired",
        block: 3600000,
        reward: baseReward * 2,
        baseOnly: false,
        paRemaining: TOTAL_PA_SUPPLY - (3600000 - THIRD_START) * PA_RATE_PERIOD_1
    });
    
    // 6. The cut — one chain, revenue-funded nodes (ERSTETER PA DEPLETION)
    baseReward *= 0.9;
    events.push({
        name: "The cut — one chain, revenue-funded nodes",
        block: 3787502,
        reward: baseReward,
        baseOnly: true,
        paRemaining: 0
    });
    
    // 7. Retiring chains shut down (INGEN endring)
    events.push({
        name: "Retiring chains shut down",
        block: 3880000,
        reward: baseReward,
        baseOnly: true,
        paRemaining: 0
    });
    
    // Gjenværende halveringer (2nd, 3rd, 4th ... 8th)
    let nextBlock = 4122400;
    for (let i = 2; i <= 8; i++) {
        baseReward *= 0.9;
        events.push({
            name: i + "th Proof-of-Node reduction (−10%)",
            block: nextBlock,
            reward: baseReward,
            baseOnly: true,
            paRemaining: 0
        });
        nextBlock += HALVING_INTERVAL;
    }
    
    events.sort((a, b) => a.block - b.block);
    return events;
}

async function updateSchedule() {
    const currentHeight = await fetch(API_URL)
        .then(r => r.json())
        .then(data => data.info.blocks);
    
    document.getElementById("currentHeight").innerText = currentHeight.toLocaleString();
    
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById("timezoneInfo").innerText = "All dates shown in your timezone: " + tz;
    
    const currentReward = calculateCurrentReward(currentHeight);
    document.getElementById("currentReward").innerText = currentReward.toFixed(6) + " FLUX";
    
    const events = generateSchedule(currentHeight);
    const table = document.getElementById("scheduleTable");
    table.innerHTML = "";
    
    let nextReductionTime = null;
    let previousEvent = events[0];
    let nextEvent = null;
    
    for (let event of events) {
        if (event.block > currentHeight && !nextReductionTime) {
            nextReductionTime = estimateDate(currentHeight, event.block);
        }
        
        const row = document.createElement("tr");
        
        const dateDisplay = event.block > currentHeight
            ? formatDate(estimateDate(currentHeight, event.block))
            : "Already Passed";
        
        row.innerHTML = `
            <td>${event.name}</td>
            <td>${event.block.toLocaleString()}</td>
            <td>${dateDisplay}</td>
            <td>${event.reward.toFixed(6)} FLUX</td>
        `;
        
        table.appendChild(row);
        
        if (event.block <= currentHeight) {
            previousEvent = event;
        } else if (!nextEvent) {
            nextEvent = event;
        }
    }
    
    // Progress bar
    if (nextEvent && nextEvent.block !== previousEvent.block) {
        const cycleStart = previousEvent.block;
        const cycleEnd = nextEvent.block;
        const blocksInCycle = cycleEnd - cycleStart;
        const blocksPassed = currentHeight - cycleStart;
        const progress = Math.min((blocksPassed / blocksInCycle) * 100, 100);
        
        document.getElementById("progressFill").style.width = progress + "%";
        document.getElementById("progressText").innerText =
            progress.toFixed(2) + "% progress to " + nextEvent.name;
    }
    
    // Countdown
    if (nextReductionTime) {
        const diff = nextReductionTime - new Date();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        document.getElementById("countdown").innerText =
            `${days} days, ${hours}h ${minutes}m`;
    }
}

// Initial load and refresh every 60 seconds
updateSchedule();
setInterval(updateSchedule, 60000);
