import { uniq } from 'lodash';
import * as mongoose from 'mongoose';

import { generateNumberSlug } from '../utils/slugify';
import Post, { deletePostFiles } from './Post';
import Team from './Team';

const mongoSchema = new mongoose.Schema({
  createdUserId: {
    type: String,
    required: true,
  },
  teamId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
  },
  memberIds: [String],
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

mongoSchema.index({ name: 'text' });

interface IDiscussionDocument extends mongoose.Document {
  createdUserId: string;
  teamId: string;
  name: string;
  slug: string;
  memberIds: string[];
  createdAt: Date;
}

interface IDiscussionModel extends mongoose.Model<IDiscussionDocument> {
  getList({
    userId,
    teamId,
  }: {
    userId: string;
    teamId: string;
  }): Promise<{ discussions: IDiscussionDocument[] }>;

  add({
    name,
    userId,
    teamId,
    memberIds,
  }: {
    name: string;
    userId: string;
    teamId: string;
    memberIds: string[];
  }): Promise<IDiscussionDocument>;

  edit({
    userId,
    id,
    name,
    memberIds,
  }: {
    userId: string;
    id: string;
    name: string;
    memberIds: string[];
  }): Promise<{ teamId: string }>;

  delete({ userId, id }: { userId: string; id: string }): Promise<{ teamId: string }>;
}

class DiscussionClass extends mongoose.Model {
  public static async checkPermission({ userId, teamId, memberIds = [] }) {
    if (!userId || !teamId) {
      throw new Error('Bad data');
    }

    const team = await Team.findById(teamId)
      .select('memberIds teamLeaderId')
      .lean();

    if (!team || team.memberIds.indexOf(userId) === -1) {
      throw new Error('Team not found');
    }

    // all members must be member of Team.
    for (const id of memberIds) {
      if (team.memberIds.indexOf(id) === -1) {
        throw new Error('Permission denied');
      }
    }

    return { team };
  }

  public static async getList({ userId, teamId }) {
    await this.checkPermission({ userId, teamId });

    const filter: any = { teamId, memberIds: userId };

    const discussions: any[] = await this.find(filter).lean();

    return { discussions };
  }

  public static async add({ name, userId, teamId, memberIds = [] }) {
    if (!name) {
      throw new Error('Bad data');
    }

    await this.checkPermission({ userId, teamId, memberIds });

    const slug = await generateNumberSlug(this, { teamId });

    return this.create({
      createdUserId: userId,
      teamId,
      name,
      slug,
      memberIds: uniq([userId, ...memberIds]),
      createdAt: new Date(),
    });
  }

  public static async edit({ userId, id, name, memberIds = [] }) {
    if (!id) {
      throw new Error('Bad data');
    }

    const discussion = await this.findById(id)
      .select('teamId createdUserId')
      .lean();

    const { team } = await this.checkPermission({
      userId,
      teamId: discussion.teamId,
      memberIds,
    });

    if (discussion.createdUserId !== userId && team.teamLeaderId !== userId) {
      throw new Error('Permission denied. Only create user or team leader can update.');
    }

    await this.updateOne(
      { _id: id },
      {
        name,
        memberIds: uniq([userId, ...memberIds]),
      },
    );

    return { teamId: discussion.teamId };
  }

  public static async delete({ userId, id }) {
    if (!id) {
      throw new Error('Bad data');
    }

    const discussion = await this.findById(id)
      .select('teamId')
      .lean();

    await this.checkPermission({ userId, teamId: discussion.teamId });

    deletePostFiles(
      await Post.find({ discussionId: id })
        .select('content')
        .lean(),
    );

    await Post.deleteMany({ discussionId: id });

    await this.deleteOne({ _id: id });

    return { teamId: discussion.teamId };
  }

  public static findBySlug(teamId: string, slug: string) {
    return this.findOne({ teamId, slug }).lean();
  }
}

mongoSchema.loadClass(DiscussionClass);

const Discussion = mongoose.model<IDiscussionDocument, IDiscussionModel>('Discussion', mongoSchema);

export default Discussion;
export { IDiscussionDocument };
