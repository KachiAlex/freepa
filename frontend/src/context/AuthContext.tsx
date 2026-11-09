import type { PropsWithChildren } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { apiFetch, apiJson, clearToken, getToken, setToken } from '../api/client';

type SessionUser = {
  uid: string;
  email: string | null;
};

type OrgRoles = Record<string, string>;

type MeResponse = {
  user: SessionUser;
  organizations: string[];
  orgRoles: OrgRoles;
  platformAdmin: boolean;
};

type AuthContextValue = {
  user: SessionUser | null;
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
  refreshMembership: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [orgRoles, setOrgRoles] = useState<OrgRoles>({});
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const resetSessionState = useCallback(() => {
    setUser(null);
    setOrganizations([]);
    setOrgRoles({});
    setActiveOrgId(null);
    setIsPlatformAdmin(false);
  }, []);

  const hydrateMembership = useCallback(async () => {
    setLoading(true);
    try {
      const me = await apiFetch<MeResponse>('/api/auth/me');
      setUser(me.user);
      setOrganizations(me.organizations);
      setOrgRoles(me.orgRoles);
      setActiveOrgId((current) => {
        if (current && me.organizations.includes(current)) {
          return current;
        }
        return me.organizations[0] ?? null;
      });
      setIsPlatformAdmin(me.platformAdmin);
    } catch (error) {
      console.error('Failed to hydrate authentication context', error);
      resetSessionState();
    } finally {
      setLoading(false);
    }
  }, [resetSessionState]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    void hydrateMembership();
  }, [hydrateMembership]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async signIn(email: string, password: string) {
        const { token } = await apiJson<{ token: string }>('POST', '/api/auth/signin', {
          email,
          password,
        });
        setToken(token);
        await hydrateMembership();
      },
      async signUp(email: string, password: string) {
        const { token } = await apiJson<{ token: string }>('POST', '/api/auth/signup', {
          email,
          password,
        });
        setToken(token);
        await hydrateMembership();
      },
      async resetPassword(email: string) {
        await apiJson('POST', '/api/auth/reset-password', { email });
      },
      async signOut() {
        clearToken();
        resetSessionState();
      },
      organizations,
      orgRoles,
      activeOrgId,
      setActiveOrgId: (organizationId: string) => {
        setActiveOrgId(organizationId);
      },
      isPlatformAdmin,
      async refreshMembership() {
        if (!getToken()) {
          return;
        }
        await hydrateMembership();
      },
    }),
    [activeOrgId, hydrateMembership, isPlatformAdmin, loading, orgRoles, organizations, resetSessionState, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant() {
  const context = useAuth();
  const { organizations, activeOrgId, setActiveOrgId, loading, orgRoles, isPlatformAdmin, refreshMembership } = context;
  return { organizations, activeOrgId, setActiveOrgId, loading, orgRoles, isPlatformAdmin, refreshMembership };
}
