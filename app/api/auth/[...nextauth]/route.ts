import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Trust host headers — required for Vercel, proxies, and mobile WebViews
process.env.AUTH_TRUST_HOST = "true";

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Google OAuth ─────────────────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ── Email + Password ─────────────────────────────────────────────────────
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
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            image: true,
            password: true,
            emailVerified: true,
          },
        });

        if (!user || !user.password) {
          throw new Error("No account found with this email.");
        }

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        const passwordOk =
          (user.password.startsWith('$2') && await bcrypt.compare(credentials.password, user.password)) ||
          credentials.password === user.password;

        if (!passwordOk) {
          throw new Error("Incorrect password.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.username ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60,
  },

  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60,
      },
    },
  },

  callbacks: {
    // ── Google: upsert user in DB on first sign-in ───────────────────────────
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        try {
          // Upsert Google user into DB so they have a real user record
          await prisma.user.upsert({
            where: { email: user.email },
            update: {
              name: user.name ?? undefined,
              image: user.image ?? undefined,
              emailVerified: new Date(),
            },
            create: {
              email: user.email,
              name: user.name,
              image: user.image,
              emailVerified: new Date(),
              username: user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, ""),
            },
          });
        } catch (err) {
          console.error("[GOOGLE_SIGNIN_DB_ERROR]", err);
          // Don't block sign-in if DB save fails
        }
      }
      return true;
    },

    // ── JWT: written once on sign-in, updated on profile edit ────────────────
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        if (account?.provider === "google" && user.email) {
          // Fetch real DB user ID and username for Google user
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email: user.email },
              select: { id: true, username: true },
            });
            token.id = dbUser?.id ?? user.id;
            token.username = dbUser?.username ?? (user as any).username ?? null;
          } catch {
            token.id = user.id;
            token.username = (user as any).username ?? null;
          }
        } else {
          token.id = user.id;
          token.username = (user as any).username ?? null;
        }
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image ?? null;
        token.provider = account?.provider ?? "credentials";
      }

      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.username) token.username = session.username;
        if (session.image) token.picture = session.image;
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).provider = token.provider;
        (session.user as any).username = token.username;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
