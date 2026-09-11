import path from 'path';
import { initDatabase } from '../server/db';
import { runFinalSeed } from '../server/finalSeed';

const db = await initDatabase();
const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), 'uploads');
const result = runFinalSeed(db, uploadsDir, 'local-script');
console.log(JSON.stringify(result, null, 2));