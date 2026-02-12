const tg = window.Telegram.WebApp;
tg.expand();

let user = null;
let selectedSide = 0;
let isWatchingMode = false;
let fullLeaderboardLoaded = false;
let fullLeaderboardData = [];
let userRank = '?';
let currentShopItem = null;
let currentShopQuantity = 1;
let currentAction = 'buy';
let prices = {};

export { tg, user, selectedSide, isWatchingMode, fullLeaderboardLoaded, fullLeaderboardData, userRank, currentShopItem, currentShopQuantity, currentAction, prices };
export function setUser(newUser) { user = newUser; }
export function setSelectedSide(side) { selectedSide = side; }
export function setIsWatchingMode(watching) { isWatchingMode = watching; }
export function setFullLeaderboardLoaded(loaded) { fullLeaderboardLoaded = loaded; }
export function setFullLeaderboardData(data) { fullLeaderboardData = data; }
export function setUserRank(rank) { userRank = rank; }
export function setCurrentShopItem(item) { currentShopItem = item; }
export function setCurrentShopQuantity(quantity) { currentShopQuantity = quantity; }
export function setCurrentAction(action) { currentAction = action; }
export function setPrices(newPrices) { prices = newPrices; }