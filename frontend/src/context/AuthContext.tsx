import type { PropsWithChildren } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthInstance, getFirestoreInstance } from '../firebase/config';

type OrgRoles = Record<string, string>;

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  organizations: string[];
  orgRoles: OrgRoles;
  activeOrgId: string | null;
  setActiveOrgId: (organizationId: string) => void;
  isPlatformAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [orgRoles, setOrgRoles] = useState<OrgRoles>({});
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const auth = useMemo(() => getAuthInstance(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setOrganizations([]);
        setOrgRoles({});
        setActiveOrgId(null);
        setIsPlatformAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const token = await nextUser.getIdTokenResult(true);
        const claimOrgs = Array.isArray(token.claims.organizations)
          ? (token.claims.organizations as string[])
          : [];
        const claimRoles =
          token.claims.orgRoles && typeof token.claims.orgRoles === 'object'
            ? (token.claims.orgRoles as OrgRoles)
            : {};

        let resolvedOrganizations = [...claimOrgs];
        let resolvedRoles: OrgRoles = { ...claimRoles };
        const platformAdminClaim = token.claims.platformAdmin === true;

        if (resolvedOrganizations.length === 0 || Object.keys(resolvedRoles).length === 0) {
          const db = getFirestoreInstance();
          const membershipSnap = await getDoc(doc(db, 'users', nextUser.uid));
          if (membershipSnap.exists()) {
            const data = membershipSnap.data() as {
              organizations?: string[];
              orgRoles?: OrgRoles;
            };
            if (Array.isArray(data.organizations)) {
              resolvedOrganizations = Array.from(new Set([...resolvedOrganizations, ...data.organizations]));
            }
            if (data.orgRoles) {
              resolvedRoles = { ...resolvedRoles, ...data.orgRoles };
            }
          }
        }

        if (resolvedOrganizations.length === 0) {
          resolvedOrganizations = ['org-demo'];
        }

        setOrganizations(resolvedOrganizations);
        setOrgRoles(resolvedRoles);
        setActiveOrgId((current) => current ?? resolvedOrganizations[0] ?? null);
        setIsPlatformAdmin(platformAdminClaim);
      } catch (error) {
        console.error('Failed to hydrate authentication context', error);
        setOrganizations((prev) => (prev.length ? prev : ['org-demo']));
        setOrgRoles({});
        setActiveOrgId((current) => current ?? 'org-demo');
        setIsPlatformAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signUp(email: string, password: string) {
        await createUserWithEmailAndPassword(auth, email, password);
      },
      async resetPassword(email: string) {
        await sendPasswordResetEmail(auth, email);
      },
      async signOut() {
        await firebaseSignOut(auth);
        setOrganizations([]);
        setOrgRoles({});
        setActiveOrgId(null);
        setIsPlatformAdmin(false);
      },
      organizations,
      orgRoles,
      activeOrgId,
      setActiveOrgId: (organizationId: string) => {
        setActiveOrgId(organizationId);
      },
      isPlatformAdmin,
    }),
    [activeOrgId, auth, isPlatformAdmin, loading, orgRoles, organizations, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useTenant() {
  const context = useAuth();
  const { organizations, activeOrgId, setActiveOrgId, loading, orgRoles, isPlatformAdmin } = context;
  return { organizations, activeOrgId, setActiveOrgId, loading, orgRoles, isPlatformAdmin };
}
