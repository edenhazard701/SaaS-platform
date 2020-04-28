import * as passwordless from 'passwordless';

import sendEmail from './aws-ses';
import getEmailTemplate from './models/EmailTemplate';
import User from './models/User';
import PasswordlessMongoStore from './passwordless-token-mongostore';

function setupPasswordless({ server }) {
  const mongoStore = new PasswordlessMongoStore();
  passwordless.init(mongoStore);

  passwordless.addDelivery(async (tokenToSend, uidToSend, recipient, callback) => {
    try {
      const template = await getEmailTemplate('login', {
        loginURL: `${
          process.env.URL_API
        }/auth/logged_in?token=${tokenToSend}&uid=${encodeURIComponent(uidToSend)}`,
      });

      console.debug(template.message);

      await sendEmail({
        from: `Kelly from saas-app.builderbook.org <${process.env.EMAIL_SUPPORT_FROM_ADDRESS}>`,
        to: [recipient],
        subject: template.subject,
        body: template.message,
      });

      callback();
    } catch (err) {
      console.error('Email sending error:', err);
      callback(err);
    }
  });

  server.use(passwordless.sessionSupport());

  server.use((req, __, next) => {
    if (req.user && typeof req.user === 'string') {
      User.findById(req.user, User.publicFields(), (err, user) => {
        req.user = user;
        next(err);
      });
    } else {
      next();
    }
  });

  server.post(
    '/auth/send-token',
    passwordless.requestToken(
      async (email, __, callback) => {
        try {
          const user = await User.findOne({ email })
            .select('_id')
            .setOptions({ lean: true });

          if (user) {
            callback(null, user._id);
          } else {
            const id = await mongoStore.storeOrUpdateByEmail(email);
            callback(null, id);
          }
        } catch (error) {
          callback(error);
        }
      },
      { userField: 'email' },
    ),
    (_, res) => {
      res.json({ done: 1 });
    },
  );

  server.get(
    '/auth/logged_in',
    passwordless.acceptToken(),
    (req, __, next) => {
      if (req.user && typeof req.user === 'string') {
        User.findById(req.user, User.publicFields(), (err, user) => {
          req.user = user;
          next(err);
        });
      } else {
        next();
      }
    },
    (_, res) => {
      res.redirect(`${process.env.URL_APP}/your-settings`);
    },
  );

  server.get('/logout', passwordless.logout(), (req, res) => {
    req.logout();
    res.redirect(`${process.env.URL_APP}/login`);
  });
}

export { setupPasswordless };
