/** Re-export: canary OTP readback lives in lib for agent-path cert + e2e. */
export {
  extractProductionAuthOtp,
  isProductionCanaryOtpEmail,
  newProdcertUserEmail,
  type ProductionAuthOtpRecord,
  waitForProductionAuthOtp,
} from '@/lib/synthetic/production-auth-otp';
