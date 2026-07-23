// PM2 process definition. .cjs regardless of any "type": "module" in nearby package.json
// files, since PM2 loads this with require().
//
// cwd is set to server/ (not left at the repo root) specifically so dotenv.config() in
// server/src/index.js finds server/.env in the same place it always has, and DB_PATH's
// default of "./bench.sqlite" keeps resolving relative to server/ too — same as running
// `npm start` from inside server/ today, just under PM2 instead.
//
// max_memory_restart is set conservatively for an e2-micro's ~1GB total RAM: PM2 restarts
// the process on its own terms well before the OS OOM-killer would step in.
module.exports = {
  apps: [
    {
      name: "bench",
      script: "src/index.js",
      cwd: "./server",
      env: { NODE_ENV: "production" },
      max_memory_restart: "400M",
    },
  ],
};
