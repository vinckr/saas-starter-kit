import { type ReactElement } from 'react';
import { Registration } from '@ory/elements-react/theme';
import { useRegistrationFlow } from '@ory/nextjs/pages';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSidePropsContext } from 'next';

import type { NextPageWithLayout } from 'types';
import { AuthLayout } from '@/components/layouts';
import { Loading } from '@/components/shared';
import oryConfig from '@/lib/ory.config';

const JoinPage: NextPageWithLayout = () => {
  const flow = useRegistrationFlow();

  if (!flow) {
    return <Loading />;
  }

  return <Registration flow={flow} config={oryConfig} />;
};

JoinPage.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout>{page}</AuthLayout>;
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

export default JoinPage;
