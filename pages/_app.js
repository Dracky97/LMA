import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import { DarkModeProvider } from '../context/DarkModeContext';

function MyApp({ Component, pageProps }) {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </DarkModeProvider>
  );
}

export default MyApp;
