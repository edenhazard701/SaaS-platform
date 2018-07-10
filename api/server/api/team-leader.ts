import * as express from 'express';

import logger from '../logs';
import Invitation from '../models/Invitation';
import Team from '../models/Team';
import User from '../models/User';

const router = express.Router();

// TODO: check for Team Leader properly

router.use((req, res, next) => {
  logger.debug('team leader API', req.path);

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
});

router.post('/teams/add', async (req, res) => {
  try {
    const { name, avatarUrl } = req.body;

    logger.debug(`Express route: ${name}, ${avatarUrl}`);

    const team = await Team.add({ userId: req.user.id, name, avatarUrl });

    res.json(team);
  } catch (err) {
    logger.error(err);
    res.json({ error: err.post || err.toString() });
  }
});

router.post('/teams/update', async (req, res) => {
  try {
    const { teamId, name, avatarUrl } = req.body;

    const team = await Team.updateTeam({
      userId: req.user.id,
      teamId,
      name,
      avatarUrl,
    });

    res.json(team);
  } catch (err) {
    logger.error(err);
    res.json({ error: err.post || err.toString() });
  }
});

router.get('/teams/get-members', async (req, res) => {
  try {
    const users = await User.getTeamMembers({ userId: req.user.id, teamId: req.query.teamId });

    res.json({ users });
  } catch (err) {
    logger.error(err);
    res.json({ error: err.post || err.toString() });
  }
});

router.get('/teams/get-invited-users', async (req, res) => {
  try {
    const users = await Invitation.getTeamInvitedUsers({
      userId: req.user.id,
      teamId: req.query.teamId,
    });

    res.json({ users });
  } catch (err) {
    logger.error(err);
    res.json({ error: err.post || err.toString() });
  }
});

router.post('/teams/invite-member', async (req, res) => {
  try {
    const { teamId, email } = req.body;

    await Invitation.add({ userId: req.user.id, teamId, email });

    const newInvitation = await Invitation.add({ userId: req.user.id, teamId, email });

    res.json({ newInvitation });
  } catch (err) {
    logger.debug(err);
    res.json({ error: err.post || err.toString() });
  }
});

router.post('/teams/remove-member', async (req, res) => {
  try {
    const { teamId, userId } = req.body;

    await Team.removeMember({ teamLeaderId: req.user.id, teamId, userId });

    res.json({ done: 1 });
  } catch (err) {
    logger.debug(err);
    res.json({ error: err.post || err.toString() });
  }
});

export default router;
