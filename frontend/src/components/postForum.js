import Post from "./post";
import PostForm from "./postForm";
import { useLazyQuery, useMutation } from "@apollo/react-hooks";
import AuthService from "../services/auth.service";
import { gql } from "apollo-boost";
import {useEffect, useState} from "react"; 
import { Button } from "@mui/material";
// import {  useMessageState } from "../services/message";

const GET_PROFILE_POSTS = gql`
  query getPost($username: String! , $pageIndex: Int!) {
    getMyPosts(username: $username, pageIndex: $pageIndex) {
      _id
      poster
      posterUsername
      textContent
      image
      likes {
        liker
      }
      dislikes {
        disliker
      }
      createdAt   
      posterProfilePic
    }
  }
`;

const GET_FOLLOWING_POSTS = gql`
  query ($username: String!, $pageIndex: Int!) {
    getFollowingPosts(username: $username, pageIndex: $pageIndex) { 
      _id
      poster
      posterUsername
      textContent
      image
      likes {
        liker
      }
      dislikes {
        disliker
      }
      createdAt   
      posterProfilePic
    }
  }
`;
const DELETE_POST = gql `
  mutation deletePost($username: String!, $postId: ID!) {
    deletePost (username: $username, postId: $postId) 
  }
`; 

export default function PostForum({profile}){ 
  const [posts, setPosts] = useState(null);
  const [page, setPage] = useState(1);  
  const [noPosts, setNoPosts] = useState(false); 
  const username = AuthService.getCurrentUser(); 

  const [getProfilePosts] = useLazyQuery(GET_PROFILE_POSTS, {
    onCompleted: data => {
      setNoPosts(false);
      setPosts(data.getMyPosts);
    },  
    onError: (err) => {
      if (page === 1) setNoPosts(true); 
      else setPage(page-1); 
    }, 
  })

  const [getFollowingPost] = useLazyQuery(GET_FOLLOWING_POSTS, {
    onCompleted: data => {
      setNoPosts(false);
      setPosts(data.getFollowingPosts);
    },  
    onError: (err) => {
      if (page === 1) setNoPosts(true); 
      else setPage(page-1); 
    }, 
  })
  
  const resetPage = () => setPage(1);

  const [deletePost] = useMutation(DELETE_POST, {
    onCompleted: () => {
      resetPage();
      if (profile) getProfilePosts({variables: {username: username, pageIndex: page}});
    },
    onError: (err) => console.log(err),  
  });

  const goBack = () => {
    if (page > 1) setPage(page-1); 
  };

  const goForward = () => { 
    setPage(page+1);
  };

  useEffect(() => {
    if (profile) getProfilePosts({variables: {username: username, pageIndex: page}}); 
    else getFollowingPost({variables: {username: username, pageIndex: page}}); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // const {users} = useMessageState(); 
  // useEffect(() => {
  //   if (!profile) getFollowingPost({variables: {username: username, pageIndex: page}}); 
  // }, [users])
  return ( 
    <div>
      <PostForm getPost={profile? getProfilePosts: getFollowingPost }  resetPage={resetPage} page={page}/> 
      <h1 style={{fontSize: '5vmin'}}> Posts </h1> 
      <div style={{display: 'flex', justifyContent: 'flex-end'}}>
        <Button onClick={goBack}>  Prev </Button>
        <Button onClick={goForward}> Next  </Button>
      </div>
      {noPosts ? <p> No posts </p>
      : posts?  
      posts.map((post, index)=> {
        return (
          <Post key={index} post={post} profile={profile} deletePost={deletePost}/> 
        );
      })
      : null }
      

    </div>
  ); 
}