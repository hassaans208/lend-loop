/**
 * Tells Convex to trust JWTs issued by our Clerk instance using the "convex"
 * JWT template. CLERK_JWT_ISSUER_DOMAIN is set in the Convex dashboard
 * (npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev).
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
