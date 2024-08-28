import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-analytics.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD-5CPzp5iwNHUxloFkDBf3J8gRlUpbGVc",
    authDomain: "ton-not.firebaseapp.com",
    databaseURL: "https://ton-not-default-rtdb.firebaseio.com",
    projectId: "ton-not",
    storageBucket: "ton-not.appspot.com",
    messagingSenderId: "729333286761",
    appId: "1:729333286761:web:741fdeb1572cc1908bdff8",
    measurementId: "G-JKCWNWTLBT"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

let balance = 2500;
let energy = 1000;
let maxEnergy = 1000;
let upgradeLevel = 0;
let rechargeLevel = 0;
let tapLevel = 0;
let energyRechargeRate = 1;
let tapMultiplier = 1;
let baseCost = 500;
let selectedBoost = null;
let lastUpdateTime = Date.now();

let telegramUserId = null;

function getTelegramUserId() {
    try {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            const user = tg.initDataUnsafe?.user;
            if (user) {
                telegramUserId = user.id;
                const resultElement = document.getElementById('result');
                if (resultElement) {
                    resultElement.innerText = `Ваш Telegram ID: ${telegramUserId}`;
                }
            } else {
                const resultElement = document.getElementById('result');
                if (resultElement) {
                    resultElement.innerText = 'Не вдалося отримати ваш Telegram ID.';
                }
            }
        } else {
            console.error('Telegram WebApp не ініціалізований.');
        }
    } catch (error) {
        console.error('Помилка при отриманні Telegram ID:', error);
    }
}

function saveDataToFirebase() {
    if (telegramUserId) {
        const userRef = ref(db, `users/${telegramUserId}`);
        set(userRef, {
            balance: balance,
            energy: energy,
            maxEnergy: maxEnergy,
            upgradeLevel: upgradeLevel,
            rechargeLevel: rechargeLevel,
            tapLevel: tapLevel,
            energyRechargeRate: energyRechargeRate,
            tapMultiplier: tapMultiplier,
            lastUpdateTime: Date.now(),
            boosts: {
                energyLimit: {
                    lvl: upgradeLevel,
                    cost: baseCost + (upgradeLevel * 500)
                },
                energyRechargeSpeed: {
                    lvl: rechargeLevel,
                    cost: 1000 + (rechargeLevel * 500)
                },
                multitap: {
                    lvl: tapLevel,
                    cost: baseCost + (tapLevel * 500)
                }
            }
        }).catch((error) => {
            console.error('Error saving data to Firebase:', error);
        });
    }
}

async function loadDataFromFirebase() {
    if (telegramUserId) {
        try {
            const userRef = ref(db, `users/${telegramUserId}`);
            const snapshot = await new Promise((resolve, reject) => {
                onValue(userRef, resolve, { onlyOnce: true });
            });

            if (snapshot.exists()) {
                const data = snapshot.val();
                balance = data.balance || balance;
                energy = data.energy || energy;
                maxEnergy = data.maxEnergy || maxEnergy;
                upgradeLevel = data.upgradeLevel || upgradeLevel;
                rechargeLevel = data.rechargeLevel || rechargeLevel;
                tapLevel = data.tapLevel || tapLevel;
                energyRechargeRate = data.energyRechargeRate || energyRechargeRate;
                tapMultiplier = data.tapMultiplier || tapMultiplier;
                lastUpdateTime = data.lastUpdateTime || Date.now();

                if (data.boosts) {
                    if (data.boosts.energyLimit) {
                        upgradeLevel = data.boosts.energyLimit.lvl;
                        baseCost = data.boosts.energyLimit.cost - (upgradeLevel * 500);
                    }
                    if (data.boosts.energyRechargeSpeed) {
                        rechargeLevel = data.boosts.energyRechargeSpeed.lvl;
                    }
                    if (data.boosts.multitap) {
                        tapLevel = data.boosts.multitap.lvl;
                    }
                }

                updateEnergyInBackground();
                updateDisplay();
            }
        } catch (error) {
            console.error('Помилка при завантаженні даних з Firebase:', error);
        }
    }
}

function processPurchase(item) {
    try {
        if (!item || item.classList.contains('disabled')) {
            showMessage('Цей буст вже на максимальному рівні.');
            return;
        }

        const levelText = item.querySelector('.boost-level')?.innerText;
        const level = parseInt(levelText) + 1;

        if (isNaN(level)) {
            console.error('Не вдалося отримати рівень буста');
            return;
        }

        let cost;
        if (item.dataset.boost === 'energy-limit') {
            cost = baseCost + (level - 1) * 500;
        } else if (item.dataset.boost === 'energy-recharge-speed') {
            cost = 1000 + (level - 1) * 500;
        } else if (item.dataset.boost === 'multitap') {
            cost = baseCost + (level - 1) * 500;
        }

        if (balance >= cost) {
            balance -= cost;
            const boostLevelElement = item.querySelector('.boost-level');
            if (boostLevelElement) {
                boostLevelElement.innerText = `${level} lvl`;
            }

            if (item.dataset.boost === 'energy-limit') {
                maxEnergy += 500;
                upgradeLevel += 1;
            } else if (item.dataset.boost === 'energy-recharge-speed') {
                energyRechargeRate += 1;
                rechargeLevel += 1;
            } else if (item.dataset.boost === 'multitap') {
                tapMultiplier += 1;
                tapLevel += 1;
            }

            updateBoostCost();
            updateDisplay();
            showMessage(`${item.querySelector('.boost-name')?.innerText} (Level ${level}) активовано!`);
            saveDataToFirebase();
        } else {
            showInsufficientFundsModal();
        }
    } catch (error) {
        console.error('Помилка при обробці покупки:', error);
    }
}

function updateBoostCost() {
    try {
        const energyLimitCost = baseCost + (upgradeLevel * 500);
        const energyLimitElement = document.querySelector('.boost-item[data-boost="energy-limit"] .boost-cost');
        if (energyLimitElement) {
            energyLimitElement.innerText = energyLimitCost.toLocaleString();
        }

        const rechargeSpeedCost = 1000 + (rechargeLevel * 500);
        const rechargeSpeedElement = document.querySelector('.boost-item[data-boost="energy-recharge-speed"] .boost-cost');
        if (rechargeSpeedElement) {
            rechargeSpeedElement.innerText = rechargeSpeedCost.toLocaleString();
        }

        const tapMultiplierCost = baseCost + (tapLevel * 500);
        const tapMultiplierElement = document.querySelector('.boost-item[data-boost="multitap"] .boost-cost');
        if (tapMultiplierElement) {
            tapMultiplierElement.innerText = tapMultiplierCost.toLocaleString();
        }
    } catch (error) {
        console.error('Помилка при оновленні вартості бустів:', error);
    }
}

function showConfirmModal(boost) {
    try {
        selectedBoost = boost;
        const level = parseInt(boost.querySelector('.boost-level')?.innerText) + 1;
        let cost;
        if (boost.dataset.boost === 'energy-limit') {
            cost = baseCost + (level - 1) * 500;
        } else if (boost.dataset.boost === 'energy-recharge-speed') {
            cost = 1000 + (level - 1) * 500;
        } else if (boost.dataset.boost === 'multitap') {
            cost = baseCost + (level - 1) * 500;
        }
        const confirmTextElement = document.getElementById('confirmText');
        if (confirmTextElement) {
            confirmTextElement.innerText = `Ви впевнені, що хочете купити ${boost.querySelector('.boost-name')?.innerText} (Level ${level}) за ${cost.toLocaleString()} балів?`;
        }
        const confirmModalElement = document.getElementById('confirmModal');
        if (confirmModalElement) {
            confirmModalElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Помилка при показі модального вікна підтвердження:', error);
    }
}

function closeConfirmModal() {
    try {
        const confirmModalElement = document.getElementById('confirmModal');
        if (confirmModalElement) {
            confirmModalElement.style.display = 'none';
            selectedBoost = null;
        }
    } catch (error) {
        console.error('Помилка при закритті модального вікна підтвердження:', error);
    }
}

function showInsufficientFundsModal() {
    try {
        const insufficientFundsModalElement = document.getElementById('insufficientFundsModal');
        if (insufficientFundsModalElement) {
            insufficientFundsModalElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Помилка при показі модального вікна недостатніх коштів:', error);
    }
}
        
        document.getElementById('insufficientFundsOk')?.addEventListener('click', () => {
        try {
            const insufficientFundsModalElement = document.getElementById('insufficientFundsModal');
            if (insufficientFundsModalElement) {
                insufficientFundsModalElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Помилка при закритті модального вікна недостатніх коштів:', error);
        }
        });
        
        document.getElementById('confirmYes')?.addEventListener('click', () => {
        try {
            if (selectedBoost) {
                processPurchase(selectedBoost);
                closeConfirmModal();
            }
        } catch (error) {
            console.error('Помилка при підтвердженні покупки:', error);
        }
        });
        
        document.getElementById('confirmNo')?.addEventListener('click', () => {
            closeConfirmModal();
        });
        
        document.querySelectorAll('.boost-item').forEach((item) => {
            item.addEventListener('click', () => {
                try {
                    if (item.classList.contains('disabled')) {
                        showMessage('Цей буст вже на максимальному рівні.');
                    } else {
                        showConfirmModal(item);
                    }
                } catch (error) {
                    console.error('Помилка при обробці кліку на елемент бусту:', error);
                }
            });
        });
        
        document.getElementById('coin')?.addEventListener('click', () => {
        try {
            if (energy >= tapMultiplier) {
                balance += tapMultiplier;
                energy -= tapMultiplier;
                updateDisplay();
                saveDataToFirebase();
            } else {
                showMessage('Немає достатньо енергії для цього кліку!');
            }
        } catch (error) {
            console.error('Помилка при обробці кліку на монету:', error);
        }
        });
        
        setInterval(() => {
        try {
            if (energy < maxEnergy) {
                energy += energyRechargeRate;
                if (energy > maxEnergy) {
                    energy = maxEnergy;
                }
                updateDisplay();
                saveDataToFirebase();
            }
        } catch (error) {
            console.error('Помилка при оновленні енергії:', error);
        }
        }, 1000);
        
        window.addEventListener('focus', updateEnergyInBackground);
        
        window.addEventListener('blur', () => {
        try {
            lastUpdateTime = Date.now();
            saveDataToFirebase();
        } catch (error) {
            console.error('Помилка при обробці події втрати фокусу:', error);
        }
        });
        
        document.getElementById('boosts-btn')?.addEventListener('click', () => {
        try {
            const boostsModalElement = document.getElementById('boostsModal');
            if (boostsModalElement) {
                boostsModalElement.style.display = 'block';
            }
        } catch (error) {
            console.error('Помилка при показі модального вікна бустів:', error);
        }
        });
        
        document.querySelector('.close')?.addEventListener('click', () => {
        try {
            const boostsModalElement = document.getElementById('boostsModal');
            if (boostsModalElement) {
                boostsModalElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Помилка при закритті модального вікна бустів:', error);
        }
        });
        
        window.addEventListener('click', (event) => {
        try {
            const boostsModalElement = document.getElementById('boostsModal');
            if (event.target === boostsModalElement) {
                boostsModalElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Помилка при обробці кліку поза межами модального вікна бустів:', error);
        }
        });
        
        document.getElementById('frens-btn')?.addEventListener('click', () => {
        try {
            const gameScreenElement = document.getElementById('game-screen');
            const frensScreenElement = document.getElementById('frens-screen');
            if (gameScreenElement && frensScreenElement) {
                gameScreenElement.style.display = 'none';
                frensScreenElement.style.display = 'block';
            }
        } catch (error) {
            console.error('Помилка при переході на екран “Frens”:', error);
        }
        });
        
        document.querySelector('.back-btn')?.addEventListener('click', () => {
        try {
            const gameScreenElement = document.getElementById('game-screen');
            const frensScreenElement = document.getElementById('frens-screen');
            if (gameScreenElement && frensScreenElement) {
                frensScreenElement.style.display = 'none';
                gameScreenElement.style.display = 'block';
            }
        } catch (error) {
            console.error('Помилка при поверненні на головний екран:', error);
        }
        });
        
        document.getElementById('get-id-btn')?.addEventListener('click', function() {
        try {
            const tg = window.Telegram?.WebApp;
            const user = tg?.initDataUnsafe?.user;
            if (user) {
                const resultElement = document.getElementById('result');
                if (resultElement) {
                    resultElement.innerText = `Ваш Telegram ID: ${user.id}`;
                }
            } else {
                const resultElement = document.getElementById('result');
                if (resultElement) {
                    resultElement.innerText = 'Не вдалося отримати ваш Telegram ID.';
                }
            }
        } catch (error) {
            console.error('Помилка при отриманні Telegram ID:', error);
        }
        });
        
        window.onload = function() {
        try {
            getTelegramUserId();
            loadDataFromFirebase();
        } catch (error) {
            console.error('Помилка при завантаженні сторінки:', error);
        }
        };
        
        function updateDisplay() {
        try {
            const balanceElement = document.getElementById('balance');
            if (balanceElement) {
                balanceElement.innerText = `Баланс: ${balance.toLocaleString()}`;
            }
            const energyElement = document.getElementById('energy');
            if (energyElement) {
                energyElement.innerText = `Енергія: ${energy}/${maxEnergy}`;
            }
            const energyLimitElement = document.querySelector('.boost-item[data-boost="energy-limit"] .boost-level');
            if (energyLimitElement) {
                energyLimitElement.innerText = `${upgradeLevel} lvl`;
            }
            const rechargeSpeedElement = document.querySelector('.boost-item[data-boost="energy-recharge-speed"] .boost-level');
            if (rechargeSpeedElement) {
                rechargeSpeedElement.innerText = `${rechargeLevel} lvl`;
            }
            const multitapElement = document.querySelector('.boost-item[data-boost="multitap"] .boost-level');
            if (multitapElement) {
                multitapElement.innerText = `${tapLevel} lvl`;
            }
            updateBoostCost();
        } catch (error) {
            console.error('Помилка при оновленні дисплея:', error);
        }
        }
        
        function updateEnergyInBackground() {
        try {
            const timePassed = (Date.now() - lastUpdateTime) / 1000;
            const energyToAdd = Math.floor(timePassed * energyRechargeRate);
            energy = Math.min(maxEnergy, energy + energyToAdd);
            lastUpdateTime = Date.now();
            updateDisplay();
            saveDataToFirebase();
        } catch (error) {
            console.error('Помилка при оновленні енергії у фоні:', error);
        }
        }
        
        function showMessage(message) {
        try {
            const messageBox = document.getElementById('messageBox');
            if (messageBox) {
                messageBox.innerText = message;
                messageBox.style.display = 'block';
                setTimeout(() => {
                    messageBox.style.display = 'none';
                }, 3000);
            }
        } catch (error) {
            console.error('Помилка при показі повідомлення:', error);
        }
        }