import firstVisit from './firstVisit.js';
import secondVisit from './secondVisit.js';
import nPlusOne from './nPlusOne.js';
import cacheDown from './cacheDown.js';
import serverDown from './serverDown.js';
import cors from './cors.js';
import rateLimit from './rateLimit.js';

// Orden del menú: primero cómo funciona todo, luego las averías
export const SCENARIOS = [firstVisit, secondVisit, nPlusOne, cacheDown, serverDown, cors, rateLimit];
