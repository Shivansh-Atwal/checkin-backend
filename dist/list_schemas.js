"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./config/db"));
async function run() {
    try {
        const res = await db_1.default.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'
    `);
        console.log('SCHEMAS:', res.map((r) => r.schema_name));
    }
    catch (err) {
        console.error(err);
    }
    finally {
        await db_1.default.$disconnect();
    }
}
run();
