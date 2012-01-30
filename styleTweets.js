// This script requires jQuery.
$(document).ready(function() {
    styleTweets();
});

function styleTweets() {
  $(".bbpBox").each( function(i) {
    var divID = $(this).attr("id");
    var tweetID = divID.slice(1);
    var tweetURL = 'http://api.twitter.com/1/statuses/show/' + tweetID + '.json?callback=?';
    $.getJSON(tweetURL, function(data){
      var twDate = new Date(data.created_at);
      var shortdate = twDate.toDateString();
      if (data.user.profile_use_background_image == true) {
        $("#" + divID).css('background', 'url(' + data.user.profile_background_image_url + ') #' + data.user.profile_background_color);
      }
      else {
        $("#" + divID).css('background', '#' + data.user.profile_background_color);
      }
      $("#" + divID + " .twMeta").css('display', 'none');
      content = $("#" + divID + " .twContent").append('<p class="twDate"><a href="http://twitter.com/' + data.user.screen_name + '/status/' + tweetID + '">' + shortdate + '</a></p><p class="twAuthor"><a href="http://twitter.com/' + data.user.screen_name + '"><img src="' + data.user.profile_image_url + '" /></a><a href="http://twitter.com/' + data.user.screen_name + '"><strong>@' + data.user.screen_name + '</strong></a><br /><span class="realName">' + data.user.name + '</span></span></p>' );
      });
  });
}