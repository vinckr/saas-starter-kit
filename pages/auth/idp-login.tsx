import { useRouter } from 'next/router';
import { ReactElement, useEffect } from 'react';

export default function SAMLIdPLogin() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/sso');
  }, [router]);

  return null;
}

SAMLIdPLogin.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};
