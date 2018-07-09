import React from 'react';
import Button from '@material-ui/core/Button';
import Avatar from '@material-ui/core/Avatar';
import NProgress from 'nprogress';
import { inject, observer } from 'mobx-react';
import marked from 'marked';
import he from 'he';
import { MentionsInput, Mention } from 'react-mentions';

import { Store, User } from '../../lib/store';
import { resizeImage } from '../../lib/resizeImage';
import notify from '../../lib/notifier';
import {
  getSignedRequestForUpload,
  uploadFileUsingSignedPutRequest,
} from '../../lib/api/team-member';
import getRootUrl from '../../lib/api/getRootUrl';

import PostContent from './PostContent';

function getImageDimension(file): Promise<{ width: number; height: number }> {
  var reader = new FileReader();
  var img = new Image();

  return new Promise(resolve => {
    reader.onload = e => {
      img.onload = function() {
        resolve({ width: img.width, height: img.height });
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

interface MyProps {
  store?: Store;
  onChanged: Function;
  content: string;
  members: User[];
}

interface MyState {
  htmlContent: string;
}

class PostEditor extends React.Component<MyProps, MyState> {
  state = {
    htmlContent: '',
  };

  showMarkdownContent = () => {
    this.setState({ htmlContent: '' });
  };

  showHtmlContent = async () => {
    const { content } = this.props;

    function markdownToHtml(content) {
      const renderer = new marked.Renderer();

      renderer.link = (href, title, text) => {
        const t = title ? ` title="${title}"` : '';
        return `
          <a target="_blank" href="${href}" rel="noopener noreferrer"${t}>
            ${text}
            <i class="material-icons" style="font-size: 13px; vertical-align: baseline">
              launch
            </i>
          </a>
        `;
      };

      marked.setOptions({
        renderer,
        breaks: true,
      });

      return marked(he.decode(content));
    }

    const htmlContent = content ? markdownToHtml(content) : '<span>Nothing to preview.</span>';
    this.setState({ htmlContent: htmlContent });
  };

  uploadFile = async () => {
    const { content } = this.props;
    const { store } = this.props;
    const { currentTeam } = store;

    const file = document.getElementById('upload-file').files[0];

    if (file == null) {
      notify('No file selected.');
      return;
    }

    NProgress.start();

    document.getElementById('upload-file').value = '';

    const bucket = 'async-posts';
    const prefix = `${currentTeam.slug}`;

    const { width, height } = await getImageDimension(file);

    try {
      const responseFromApiServerForUpload = await getSignedRequestForUpload({
        file,
        prefix,
        bucket,
      });

      const resizedFile = await resizeImage(file, 1024, 1024);

      await uploadFileUsingSignedPutRequest(
        resizedFile,
        responseFromApiServerForUpload.signedRequest,
      );

      const imgSrc = `${getRootUrl()}/uploaded-file?teamSlug=${
        currentTeam.slug
      }&bucket=${bucket}&path=${responseFromApiServerForUpload.path}`;

      const finalWidth = width > 768 ? '100%' : width;

      const markdownImage = `<details class="lazy-load-image">
        <summary>Click to see <b>${file.name}</b></summary>

        <div class="lazy-load-image-body">
          <img width="${finalWidth}" data-width="${finalWidth}" data-height="${height}" data-src="${imgSrc}" alt="Async" class="s3-image" style="display: none;" />
        </div>
      </details>`;

      this.props.onChanged(content.concat('\n', markdownImage.replace(/\s+/g, ' ')));

      // TODO: delete image if image is added but Post is not saved
      // TODO: see more on Github's issue
      NProgress.done();
      notify('You successfully uploaded file.');
    } catch (error) {
      console.log(error);
      notify(error);
      NProgress.done();
    }
  };

  render() {
    const { htmlContent } = this.state;
    const { content, members, store } = this.props;
    const { currentUser } = store;

    const membersMinusCurrentUser = members.filter(member => member._id !== currentUser._id);

    return (
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'inline-flex' }}>
          <Button
            color="primary"
            onClick={this.showMarkdownContent}
            variant="flat"
            style={{ fontWeight: htmlContent ? 300 : 600 }}
          >
            Markdown
          </Button>{' '}
          <Button
            color="primary"
            onClick={this.showHtmlContent}
            variant="flat"
            style={{ fontWeight: htmlContent ? 600 : 300 }}
          >
            HTML
          </Button>
        </div>

        <div style={{ display: 'inline', float: 'right' }}>
          <input
            accept="image/*"
            name="upload-file"
            id="upload-file"
            type="file"
            style={{ display: 'none' }}
            onChange={this.uploadFile}
          />
          <label htmlFor="upload-file">
            <Button color="primary" component="span">
              Upload file
            </Button>
          </label>
        </div>
        <br />
        <div
          style={{
            width: '100%',
            height: '100%',
            padding: '10px 15px',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            overflow: 'auto',
          }}
        >
          {htmlContent ? (
            <PostContent html={htmlContent} />
          ) : (
            <MentionsInput
              style={{
                input: {
                  border: 'none',
                  outline: 'none',
                  font: '16px Muli',
                  color: '#fff',
                  fontWeight: 300,
                  height: '100vh', // TODO: check on Mobile
                  lineHeight: '1.5em',
                },
                suggestions: {
                  list: {
                    backgroundColor: '#222',
                    color: '#fff',
                  },

                  item: {
                    padding: '5px 15px',
                    borderBottom: '1px solid rgba(0,0,0,0.15)',

                    '&focused': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    },
                  },
                },
              }}
              autoFocus
              value={content}
              placeholder="Compose new post"
              markup={`\`@__display__\` `}
              displayTransform={display => `\`@${display}\` `}
              onChange={event => {
                this.props.onChanged(event.target.value);
              }}
            >
              <Mention
                trigger="@"
                data={membersMinusCurrentUser.map(u => ({
                  id: u.avatarUrl,
                  display: u.displayName,
                  you: u._id === currentUser._id ? true : false,
                }))}
                renderSuggestion={suggestion => (
                  <React.Fragment>
                    <Avatar
                      role="presentation"
                      src={suggestion.id}
                      alt={suggestion.display}
                      style={{
                        width: '24px',
                        height: '24px',
                        marginRight: '10px',
                        display: 'inline-flex',
                        verticalAlign: 'middle',
                      }}
                    />
                    <span style={{ marginRight: '5px' }}>{suggestion.display}</span>
                  </React.Fragment>
                )}
              />
            </MentionsInput>
          )}
        </div>
      </div>
    );
  }
}

export default inject('store')(observer(PostEditor));
