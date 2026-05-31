import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Dynamically resolve the correct base URL for NextAuth callbacks if not already configured.
// VERCEL_URL is automatically set by Vercel on every deployment.
if (!process.env.NEXTAUTH_URL && process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

export const authOptions: NextAuthOptions = {
  // No PrismaAdapter — JWT sessions are incompatible with it when using CredentialsProvider.
  // We handle DB writes manually via signIn callback (Google) and /api/register (credentials).

  providers: [
    // ── Google OAuth ──────────────────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ── Email + Password ──────────────────────────────────────────────────────
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("No account found with this email.");
        }

        // Block unverified users
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Incorrect password.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.username ?? null,
          image: user.image,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60, // 1 year session persistence for mobile/PWA
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60, // Keep session cookie on disk for 1 year
      },
    },
  },

  callbacks: {
    // ── Save Google users to DB on first sign-in ──────────────────────────────
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          if (!user.email) {
            console.error("[GOOGLE_SIGNIN_ERROR] No email returned from Google");
            return false;
          }

          // Attempt DB write
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
              emailVerified: new Date(),
            },
            create: {
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
              emailVerified: new Date(),
            },
          });
          
          console.log("[GOOGLE_SIGNIN_SUCCESS] User saved to database");
          return true;
        } catch (error) {
          console.error("[GOOGLE_SIGNIN_DB_ERROR] Failed to upsert user:", error);
          // Return false to block sign-in if database write fails (prevents inconsistent state)
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        // Find the user in our DB to get their CUID
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! }
        });
        if (dbUser) {
          token.id = dbUser.id;
        } else {
          token.id = user.id;
        }
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },


    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).provider = token.provider;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/",
    // Temporarily disabled to see the real NextAuth error page
    // error: "/", 
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// Runtime environment check
console.log("[AUTH_INIT] NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
console.log("[AUTH_INIT] DATABASE_URL present:", !!process.env.DATABASE_URL);

export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
