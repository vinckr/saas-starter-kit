import { AuthLayout } from '@/components/layouts';
import { InputWithLabel } from '@/components/shared';
import { useFormik } from 'formik';
import { GetServerSidePropsContext } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import { type ReactElement, useState } from 'react';
import { Button } from 'react-daisyui';
import { toast } from 'react-hot-toast';
import type { NextPageWithLayout } from 'types';
import * as Yup from 'yup';
import Head from 'next/head';
import { maxLengthPolicies } from '@/lib/common';

async function startKratosSSO() {
  const origin = window.location.origin;

  const flowRes = await fetch(`${origin}/self-service/login/browser`, {
    headers: { accept: 'application/json' },
    credentials: 'include',
  });
  const flow = await flowRes.json();
  const csrfToken = flow?.ui?.nodes?.find(
    (n: any) => n?.attributes?.name === 'csrf_token'
  )?.attributes?.value;

  const submitRes = await fetch(flow.ui.action, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      method: 'oidc',
      provider: 'sso',
      csrf_token: csrfToken,
    }),
  });

  const body = await submitRes.json().catch(() => ({}));
  const redirect = body?.redirect_browser_to;

  if (redirect) {
    window.location.href = redirect;
    return;
  }

  throw new Error('Unable to start SSO login.');
}

const SSO: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const [useEmail, setUseEmail] = useState(true);

  const formik = useFormik({
    initialValues: {
      slug: '',
      email: '',
    },
    validationSchema: Yup.object().shape(
      useEmail
        ? {
            email: Yup.string()
              .email()
              .required('Email is required')
              .max(maxLengthPolicies.email),
          }
        : {
            slug: Yup.string()
              .required('Team slug is required')
              .max(maxLengthPolicies.slug),
          }
    ),
    onSubmit: async (values) => {
      const response = await fetch('/api/auth/sso/verify', {
        method: 'POST',
        body: JSON.stringify(values),
      });

      const { data, error } = await response.json();

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.useSlug) {
        formik.resetForm();
        setUseEmail(false);
        toast.error(t('multiple-sso-teams'));
        return;
      }

      const startRes = await fetch('/api/auth/sso/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teamId: data.teamId }),
      });

      if (!startRes.ok) {
        const { error: startError } = await startRes.json().catch(() => ({}));
        toast.error(startError?.message || 'Unable to start SSO login.');
        return;
      }

      try {
        await startKratosSSO();
      } catch (err: any) {
        toast.error(err.message || 'Unable to start SSO login.');
      }
    },
  });

  return (
    <>
      <Head>
        <title>{t('signin-with-saml-sso')}</title>
      </Head>
      <div className="rounded p-6 border">
        <form onSubmit={formik.handleSubmit}>
          <div className="space-y-2">
            {useEmail ? (
              <InputWithLabel
                type="email"
                label="Email"
                name="email"
                placeholder="user@ory.com"
                value={formik.values.email}
                error={formik.touched.email ? formik.errors.email : undefined}
                onChange={formik.handleChange}
              />
            ) : (
              <InputWithLabel
                type="text"
                label="Team slug"
                name="slug"
                placeholder="ory"
                value={formik.values.slug}
                descriptionText="Contact your administrator to get your team slug"
                error={formik.touched.slug ? formik.errors.slug : undefined}
                onChange={formik.handleChange}
              />
            )}
            <Button
              type="submit"
              color="primary"
              loading={formik.isSubmitting}
              active={formik.dirty}
              fullWidth
              size="md"
            >
              {t('continue-with-saml-sso')}
            </Button>
          </div>
        </form>
        <div className="divider"></div>
        <div className="space-y-3">
          <Link href="/auth/login" className="btn btn-outline w-full">
            {t('sign-in-with-password')}
          </Link>
        </div>
      </div>
    </>
  );
};

SSO.getLayout = function getLayout(page: ReactElement) {
  return (
    <AuthLayout
      heading="signin-with-saml-sso"
      description="desc-signin-with-saml-sso"
    >
      {page}
    </AuthLayout>
  );
};

export async function getServerSideProps({
  locale,
}: GetServerSidePropsContext) {
  return {
    props: {
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
    },
  };
}

export default SSO;
