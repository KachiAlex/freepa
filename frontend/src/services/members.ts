import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirestoreInstance, getFunctionsInstance } from '../firebase/config';
import type { OrganizationMember } from '../types/membership';

function toIso(value?: Timestamp | string): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toDate().toISOString();
}

export async function listMembers(organizationId: string): Promise<OrganizationMember[]> {
  const db = getFirestoreInstance();
  const membersRef = collection(db, 'organizations', organizationId, 'members');
  const snapshot = await getDocs(membersRef);

  const members = await Promise.all(
    snapshot.docs.map(async (memberDoc) => {
      const memberData = memberDoc.data() as { role: string; updatedAt?: Timestamp | string };
      const userDoc = await getDoc(doc(db, 'users', memberDoc.id));
      const userData = userDoc.exists() ? (userDoc.data() as { email?: string }) : {};

      return {
        uid: memberDoc.id,
        role: memberData.role,
        email: userData.email ?? null,
        updatedAt: toIso(memberData.updatedAt),
      } satisfies OrganizationMember;
    }),
  );

  return members.sort((a, b) => (a.role.localeCompare(b.role)));
}

export async function assignMemberRole(params: {
  organizationId: string;
  targetUid: string;
  role: string;
}): Promise<void> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable(functions, 'setMemberRole');
  await callable(params);
}

export async function removeMember(params: {
  organizationId: string;
  targetUid: string;
}): Promise<void> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable(functions, 'removeMember');
  await callable(params);
}

