const API_URL = "https://explorer.runonflux.io/api/status";

const BLOCK_TIME_SECONDS = 30;

const THIRD_START = 2020000;
const FOURTH_HALVING = 3071200;
const PA_DEPLETION = 3466630;
const HALVING_INTERVAL = 1051200;

const INITIAL_REWARD = 14;

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

    let reward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;

    while (halvingBlock <= currentHeight) {

        reward *= 0.9;

        if (halvingBlock < PA_DEPLETION &&
            PA_DEPLETION <= halvingBlock + HALVING_INTERVAL &&
            currentHeight >= PA_DEPLETION) {
            reward *= 0.5;
        }

        halvingBlock += HALVING_INTERVAL;
    }

    return reward;
}

function generateSchedule(currentHeight) {

    const events = [];
    let reward = INITIAL_REWARD;
    let halvingBlock = FOURTH_HALVING;

    events.push({
        name: "3rd Period Start",
        block: THIRD_START,
        reward: reward
    });

    for (let halving = 4; halving <= 12; halving++) {

        reward *= 0.9;

        events.push({
            name: halving + "th Halving (−10%)",
            block: halvingBlock,
            reward: reward
        });

        if (halvingBlock < PA_DEPLETION &&
            PA_DEPLETION < halvingBlock + HALVING_INTERVAL) {

            reward *= 0.5;

            events.push({
                name: "PA Depletion (−50%)",
                block: PA_DEPLETION,
                reward: reward
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

    const progress = Math.min((currentHeight / 6000000) * 100, 100);
    document.getElementById("progressFill").style.width = progress + "%";
    document.getElementById("progressText").innerText =
        progress.toFixed(2) + "% of current halving schedule completed";

    // countdown already running; no need to restart it repeatedly
}

// initial load
init();
startCountdown();

// refresh data every minute without reloading page
setInterval(init, 60000);