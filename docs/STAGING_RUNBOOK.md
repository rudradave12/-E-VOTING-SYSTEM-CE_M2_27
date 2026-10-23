# BlockBallot — Staging & Local Operations Runbook

> [!NOTE]
> **Operating Environment: Windows PowerShell**
> This runbook contains tested PowerShell commands for local verification, hermetic testing, and future staging deployment readiness.

---

## 1. Reproducible Dependency Installation

To install dependencies cleanly without modifying package versions or lockfiles:

```powershell
# Ensure working directory is the project root
Set-Location -Path "E:\Projects\BlockBallot-EVoting-System"

# Verify Node.js and npm versions
node --version
npm --version

# Reproducible installation from lockfile
npm ci
```

---

## 2. Managing the Local Blockchain (Hardhat)

BlockBallot uses a private, local Ethereum execution environment (Chain ID `31337`) on `127.0.0.1:8545`.

### A. Start the Local Blockchain Node
Open a dedicated PowerShell terminal:
```powershell
# Start local Hardhat node on port 8545
npm run node:start
```
*Expected Output:*
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
Accounts:
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
...
```

### B. Deploy Contract & Seed Candidates
In a second PowerShell terminal:
```powershell
# Deploy IndianElection.sol and seed 2024 demo candidates
npm run contract:deploy
```
*Expected Output:*
```
[Deploy] Deployer Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
[Deploy] IndianElection successfully deployed to: 0x...
[Deploy] Seeding 18th Lok Sabha General Election 2024...
[Deploy] Saved deployment manifest to: .../src/contracts/deployment.json
```

### C. Stop the Blockchain Node
In the running terminal, press `Ctrl + C` or terminate by port:
```powershell
Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 3. Managing the Local Firestore Emulator

Hermetic database testing without Google Cloud credentials.

### A. Start the Firestore Emulator
```powershell
# Start Firestore Emulator on port 8088 (UI on port 4000)
npm run emulator:start
```

### B. Stop the Firestore Emulator
In the emulator terminal, press `Ctrl + C` or kill by port:
```powershell
Get-NetTCPConnection -LocalPort 8088 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 4. Starting the Application Server

### A. Local Development & Demo Mode
Starts Vite development middleware and Express server with full synthetic test data:
```powershell
$env:NODE_ENV="development"
$env:PORT="3000"
npm run dev
```
Navigate to: [http://127.0.0.1:3000](http://127.0.0.1:3000)

### B. Hermetic Test Server (Against Emulator)
```powershell
$env:NODE_ENV="test"
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8088"
$env:GCLOUD_PROJECT="demo-blockballot"
$env:PORT="3000"
npm run dev
```

---

## 5. Automated Verification Checklist

Run all checks in a single PowerShell sequence:

```powershell
Write-Host "=== 1. Running TypeScript Static Analysis ===" -ForegroundColor Cyan
npm run lint

Write-Host "=== 2. Running Automated Test Suite ===" -ForegroundColor Cyan
npm test

Write-Host "=== 3. Running Production Build ===" -ForegroundColor Cyan
npm run build
```

---

## 6. Safety Verification: Confirming Zero Cloud Connectivity

To verify that your local instance is not accidentally communicating with live external cloud resources or public blockchains:

```powershell
# Check for active TCP connections from Node.js processes to external hosts
Get-NetTCPConnection -State Established |
  Where-Object { $_.LocalAddress -match '127\.0\.0\.1' -or $_.LocalAddress -match '::1' } |
  Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State
```
*Verification Rule:* All active database and RPC connections must resolve strictly to `127.0.0.1:8545` (Hardhat) and `127.0.0.1:8088` (Firestore Emulator). No public IPs (`0.0.0.0` or remote external subnets) should appear in established sockets.
