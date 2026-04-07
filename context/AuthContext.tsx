import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  register: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          // Fetch user role from Firestore
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          let role: UserRole = 'viewer'; // default role
          if (userDocSnap.exists()) {
            role = userDocSnap.data().role as UserRole;
          } else {
             // Si pas de doc utilisateur, on le considère comme 'viewer' par défaut.
             // (En production, le document devrait être créé lors de l'enregistrement)
          }

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            role
          });
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            role: 'viewer'
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  const register = async (email: string, pass: string) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const firebaseUser = userCredential.user;

        // Création du document utilisateur dans Firestore avec le rôle 'viewer' par défaut
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        await setDoc(userDocRef, {
            email: firebaseUser.email,
            role: 'viewer',
            createdAt: new Date().toISOString()
        });

        // L'état utilisateur sera automatiquement mis à jour par onAuthStateChanged
    } catch (error: any) {
        console.error("Registration error:", error);
        throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};
