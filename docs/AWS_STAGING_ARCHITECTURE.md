# BlockBallot — AWS Staging Architecture & Deployment Readiness

> [!NOTE]
> **Status: Architectural Reference (Unprovisioned)**
> This document specifies the proposed cloud infrastructure in AWS Asia Pacific (Mumbai) `ap-south-1` region, derived from the original project report.
> **No live AWS resources have been provisioned, created, or billed during local development.**

---

## 1. System Architecture Diagram

```
                              ┌─────────────────────────────────────┐
                              │            Amazon Route 53          │
                              │     DNS Routing & Latency Rules     │
                              └──────────────────┬──────────────────┘
                                                 │
                                                 ▼
                              ┌─────────────────────────────────────┐
                              │          AWS WAF & Shield           │
                              │  Rate Limiting, SQLi/XSS Protection │
                              └──────────────────┬──────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
         ┌─────────────────────────────┐                   ┌─────────────────────────────┐
         │       Amazon CloudFront     │                   │  Application Load Balancer  │
         │   Edge TLS, Global Caching  │                   │      (ALB - Multi-AZ)       │
         └──────────────┬──────────────┘                   └──────────────┬──────────────┘
                        │                                                 │
                        ▼                                                 ▼
         ┌─────────────────────────────┐                   ┌─────────────────────────────┐
         │          Amazon S3          │                   │  EC2 Auto Scaling Group     │
         │    Static SPA Assets (Vite) │                   │ Node.js/Express API (Docker)│
         │ (Origin Access Control-OAC) │                   │  Private Subnets (2 AZs)    │
         └─────────────────────────────┘                   └──────────────┬──────────────┘
                                                                          │
                                     ┌────────────────────────────────────┼────────────────────────────────────┐
                                     ▼                                    ▼                                    ▼
                      ┌─────────────────────────────┐      ┌─────────────────────────────┐      ┌─────────────────────────────┐
                      │          AWS KMS            │      │       Amazon SNS (SMS)      │      │       Cloud Firestore       │
                      │   Envelope Secret Crypto    │      │  +91 Mobile OTP Transaction │      │  (Cross-cloud persistence)  │
                      └─────────────────────────────┘      └─────────────────────────────┘      └─────────────────────────────┘
```

---

## 2. Component Specifications

### 1. Amazon Route 53 (DNS & Traffic Management)
* **Purpose**: Manages DNS resolution for `vote.blockballot.ac.in` and administrative subdomains with latency-based routing and health checks.
* **Required Configuration**: Public Hosted Zone, A/AAAA alias records pointing to CloudFront (frontend) and ALB (backend API).
* **Security Dependencies**: DNSSEC signing enabled, SSL/TLS certificates issued via AWS Certificate Manager (ACM).
* **Cost Implications**: ~$0.50/hosted zone/month + query volume ($0.40 per million queries).
* **Provisioning Status**: **Unprovisioned**.

### 2. AWS WAF & AWS Shield Standard
* **Purpose**: Inspects incoming HTTP(S) traffic, mitigates DDoS attacks, enforces IP-based rate limiting, and protects against common web application vulnerabilities.
* **Required Configuration**: Web ACL associated with CloudFront and ALB. Rules: AWS Managed Rules (Core rule set, Known bad inputs, SQL database) + Custom rate limit (100 req/min per IP on `/api/voter/*`).
* **Security Dependencies**: CloudWatch alarms for blocked request spikes.
* **Cost Implications**: ~$5.00/month per Web ACL + $1.00/month per rule + $0.60 per million requests.
* **Provisioning Status**: **Unprovisioned**.

### 3. Amazon CloudFront (CDN Edge)
* **Purpose**: Serves compiled static SPA assets (HTML, CSS, JS bundles) from edge locations across India (Mumbai, New Delhi, Chennai, Hyderabad, Bengaluru, Kolkata).
* **Required Configuration**: Distribution with Origin Access Control (OAC), TLS 1.3 minimum, custom error response 404 $\rightarrow$ `/index.html` (200 OK) for client-side routing.
* **Security Dependencies**: Restricts S3 bucket access solely to the CloudFront distribution service principal.
* **Cost Implications**: AWS Free Tier eligible (1 TB data transfer out/month, 10,000,000 HTTP/HTTPS requests).
* **Provisioning Status**: **Unprovisioned**.

### 4. Amazon S3 (Static Web Hosting)
* **Purpose**: Durable, immutable object storage for the production frontend bundle (`dist/`).
* **Required Configuration**: Versioning enabled, Default encryption with SSE-S3 or SSE-KMS, Public Access Blocked 100%, Bucket Policy restricting access to CloudFront OAC.
* **Security Dependencies**: CloudTrail object-level logging.
* **Cost Implications**: Minimal (<$0.50/month for standard storage under 1 GB).
* **Provisioning Status**: **Unprovisioned**.

### 5. Amazon VPC & Networking
* **Purpose**: Isolated network topology across 2 Availability Zones (`ap-south-1a`, `ap-south-1b`).
* **Required Configuration**:
  * CIDR: `10.0.0.0/16`.
  * 2 Public Subnets (for ALB and NAT Gateways).
  * 2 Private Subnets (for backend compute instances).
  * 1 Internet Gateway, 2 NAT Gateways (or 1 for non-prod staging).
* **Security Dependencies**: Security Groups enforcing least privilege (ALB accepts 443; EC2 accepts only from ALB Security Group on port 3000).
* **Cost Implications**: NAT Gateway charges (~$32.40/month per NAT Gateway in `ap-south-1`).
* **Provisioning Status**: **Unprovisioned**.

### 6. Application Load Balancer (ALB)
* **Purpose**: Distributes incoming API traffic across backend compute instances with health checks and TLS termination.
* **Required Configuration**: Internet-facing, dual-AZ, HTTPS listener with ACM certificate, health check target `/api/health` (expects 200 OK).
* **Security Dependencies**: Security Group allows inbound 443 only from WAF/CloudFront or authorized IP ranges.
* **Cost Implications**: ~$16.20 - $22.00/month base + LCU usage.
* **Provisioning Status**: **Unprovisioned**.

### 7. Amazon EC2 & Auto Scaling Group (Compute)
* **Purpose**: Hosts containerized Node.js/Express API server executing cryptographic EIP-712 signing, OTP verification, and reconciliation.
* **Required Configuration**:
  * Instance Type: `t3.small` (2 vCPU, 2 GB RAM) or `t4g.small` (Graviton2).
  * Auto Scaling Policy: Min 2, Max 6, Target CPU Utilization 70%.
  * IAM Instance Profile with permissions for KMS decrypt and CloudWatch logs.
* **Security Dependencies**: Instances in private subnets with no public IP; access via AWS Systems Manager (SSM) Session Manager (no open SSH port 22).
* **Cost Implications**: ~$15.00/month per running `t3.small` instance.
* **Provisioning Status**: **Unprovisioned**.

### 8. AWS KMS (Key Management Service)
* **Purpose**: Hardware security module (HSM) backed envelope encryption for backend secrets (`SERVER_AUTHORIZATION_SIGNER_KEY`, `SERVER_HMAC_SECRET`, `SERVER_COMMITMENT_SALT`).
* **Required Configuration**: Customer Managed Key (CMK) with annual rotation; IAM policy allowing only the backend EC2 role `kms:Decrypt`.
* **Security Dependencies**: Dedicated audit trail via CloudTrail.
* **Cost Implications**: $1.00/month per key + $0.03 per 10,000 requests.
* **Provisioning Status**: **Unprovisioned**.

### 9. Amazon SNS (Transactional SMS Gateway)
* **Purpose**: Delivers real 6-digit OTP verification challenges to Indian mobile numbers (`+91`).
* **Required Configuration**: Transactional SMS type, registered DLT (Distributed Ledger Technology) Entity and Template ID per Telecom Regulatory Authority of India (TRAI) regulations.
* **Security Dependencies**: Strict spending quotas and phone-number rate limiting to prevent SMS pumping attacks.
* **Cost Implications**: Variable per SMS (~$0.002 to $0.005 per message in India).
* **Provisioning Status**: **Unprovisioned** (Development mode uses synthetic delivery adapter in `serverStore`).

---

## 3. Estimated Staging Billing Summary

| Tier | Monthly Estimated Cost | Rationale |
| :--- | :--- | :--- |
| **Minimum Staging (1 AZ, 1 EC2, 1 NAT Gateway)** | ~$55 - $75 / month | Single NAT Gateway ($32) + 1 t3.small ($15) + ALB ($16) + Route 53 / S3 (<$3). |
| **Production-Grade (High Availability, 2 AZs, 2 NATs)** | ~$120 - $160 / month | Dual NAT Gateways ($65) + 2 t3.small instances ($30) + ALB ($20) + WAF ($15) + KMS / Logs ($5). |
| **Current Development Status** | **$0.00 (Zero Cost)** | Entire stack runs locally on loopback interfaces (`127.0.0.1`) with local mock persistence or local Firestore Emulator. |
