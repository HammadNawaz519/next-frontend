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
      clientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
      clientSecret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
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

        const input = credentials.email.trim();
        const cleanEmail = input.toLowerCase();

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: cleanEmail },
              { email: input },
              { username: input },
              { username: cleanEmail }
            ]
          },
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
            password: true,
            emailVerified: true,
          },
        });

        if (!user || !user.password) {
          throw new Error("No account found with this email or username.");
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
          name: user.username ?? null,
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
          // Check if user already exists so we don't overwrite user's custom/removed image preference
          const existing = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, image: true },
          });
          if (!existing) {
            await prisma.user.create({
              data: {
                email: user.email,
                image: user.image,
                emailVerified: new Date(),
                username: user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, ""),
              },
            });
          } else {
            await prisma.user.update({
              where: { email: user.email },
              data: {
                emailVerified: new Date(),
              },
            });
          }
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
          // Fetch real DB user ID, username, and DB-stored image
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email: user.email },
              select: { id: true, username: true, image: true },
            });
            token.id = dbUser?.id ?? user.id;
            token.username = dbUser?.username ?? (user as any).username ?? null;
            token.picture = dbUser ? dbUser.image : (user.image ?? null);
          } catch {
            token.id = user.id;
            token.username = (user as any).username ?? null;
            token.picture = user.image ?? null;
          }
        } else {
          token.id = user.id;
          token.username = (user as any).username ?? (user as any).name ?? null;
          token.picture = user.image ?? null;
        }
        token.email = user.email;
        token.name = token.username || (user as any).name || null;
        token.provider = account?.provider ?? "credentials";
      }

      if (trigger === "update" && session) {
        if (session.username) {
          token.username = session.username;
          token.name = session.username;
        } else if (session.name) {
          token.name = session.name;
          token.username = session.name;
        }
        if (session.image !== undefined) {
          token.picture = session.image || null;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).provider = token.provider;
        (session.user as any).username = token.username;
        session.user.email = token.email as string;
        session.user.name = (token.username || token.name) as string;
        session.user.image = (token.picture as string) || null;
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
