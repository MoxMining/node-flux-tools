const BLOCK_TIME_SECONDS = 30;

// --- Halvingskonstanter ---
const THIRD_START = 2020000;
const FOURTH_HALVING = 3071200;  // Første 10% reduksjon (2,020,000 + 1,051,200)
const PA_DEPLETION = 2040000;     // 20 000 blokker etter 2,020,000
const HALVING_INTERVAL = 1051200; // 1 år med 30-sekunders blokker
const INITIAL_REWARD = 14;        // 14 Flux base per block

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
    // Beregn base reward (uten PA)
    let baseReward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;
    
    while (halvingBlock <= currentHeight) {
        baseReward *= 0.9;
        halvingBlock += HALVING_INTERVAL;
    }
    
    // PA legsgiver samme beløp som base reward så lenge det er aktivt
    // Før PA depletion: total = base + base = 2 * base
    // Etter PA depletion: total = base (PA = 0)
    const paActive = currentHeight < PA_DEPLETION;
    return paActive ? baseReward * 2 : baseReward;
}

function generateSchedule(currentHeight) {

    const events = [];
    let baseReward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;

    events.push({
        name: "3rd Period Start (PoUW v.2)",
        block: THIRD_START,
        reward: baseReward * 2,  // Base + PA = 28 FLUX
        baseOnly: false
    });

    for (let halving = 4; halving <= 12; halving++) {

        baseReward *= 0.9;

        // Legg til 10% reduksjons-event
        events.push({
            name: halving + "th Reduction (−10%)",
            block: halvingBlock,
            reward: baseReward * 2,  // Base + PA = 2 * base
            baseOnly: false
        });

        // PA depletion: legg til event som viser at PA stopper
        // Men påvirker IKKE base reward
        if (halvingBlock < PA_DEPLETION &&
            PA_DEPLETION < halvingBlock + HALVING_INTERVAL) {

            // Ved PA depletion: base fortsetter uendret
            // Total = base + 0 = base (IKKE base * 2)
            events.push({
                name: "PA Depletion (PA ends)",
                block: PA_DEPLETION,
                reward: baseReward,  // Kun base, ingen PA
                baseOnly: true
            });
        }

        halvingBlock += HALVING_INTERVAL;
    }

    events.sort((a, b) => a.block - b.block);

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

        if (event.block > currentHeight && !nextReductionTime) {
            nextReductionTime = estimateDate(currentHeight, event.block);
        }

        const row = document.createElement("tr");

        const dateDisplay =
            event.block > currentHeight
                ? formatDate(estimateDate(currentHeight, event.block))
                : "Already Passed";

        row.innerHTML = `
            <td>${event.name}</td>
            <td>${event.block.toLocaleString()}</td>
            <td>${dateDisplay}</td>
            <td>${event.reward.toFixed(6)} FLUX</td>
        `;

        table.appendChild(row);
    }

    // Find the previous and next events to calculate progress within current cycle
    let previousEvent = events[0];
    let nextEvent = null;
    
    for (let event of events) {
        if (event.block <= currentHeight) {
            previousEvent = event;
        } else if (event.block > currentHeight && !nextEvent) {
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