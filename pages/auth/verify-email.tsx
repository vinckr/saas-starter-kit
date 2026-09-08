import { type ReactElement } from 'react';
import { Verification } from '@ory/elements-react/theme';
import { useVerificationFlow } from '@ory/nextjs/pages';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSidePropsContext } from 'next';

import type { NextPageWithLayout } from 'types';
import { AuthLayout } from '@/components/layouts';
import { Loading } from '@/components/shared';
import oryConfig from '@/lib/ory.config';

const VerifyEmailPage: NextPageWithLayout = () => {
  const flow = useVerificationFlow();

  if (!flow) {
    return <Loading />;
  }

  return (
    <Verification flow={flow} config={oryConfig} components={{ Card: {} }} />
  );
};

VerifyEmailPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <AuthLayout heading="confirm-email" description="confirm-email-description">
      {page}
    </AuthLayout>
  );
};

export const getServerSideProps = async ({
  locale,
}: GetServerSidePropsContext) => {
  return {
    props: {
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
    },
  };
};

export default VerifyEmailPage;
