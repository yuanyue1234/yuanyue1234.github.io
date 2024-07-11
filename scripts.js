// Theme toggle functionality
const themeToggle = document.querySelector('.theme-toggle');
const themeIcon = themeToggle.querySelector('i');

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    if (document.body.classList.contains('dark-theme')) {
        themeIcon.textContent = 'dark_mode';
    } else {
        themeIcon.textContent = 'light_mode';
    }
});

// Carousel functionality
const carousel = document.querySelector('.carousel');
const carouselItems = carousel.querySelectorAll('.carousel-item');
const carouselNavItems = carousel.querySelectorAll('.carousel-nav-item');
const prevBtn = carousel.querySelector('.prev');
const nextBtn = carousel.querySelector('.next');
let currentIndex = 0;

function showSlide(index) {
    carouselItems.forEach(item => item.classList.remove('active'));
    carouselNavItems.forEach(item => item.classList.remove('active'));
    carouselItems[index].classList.add('active');
    carouselNavItems[index].classList.add('active');
}

function nextSlide() {
    currentIndex = (currentIndex + 1) % carouselItems.length;
    showSlide(currentIndex);
}

function prevSlide() {
    currentIndex = (currentIndex - 1 + carouselItems.length) % carouselItems.length;
    showSlide(currentIndex);
}

nextBtn.addEventListener('click', nextSlide);
prevBtn.addEventListener('click', prevSlide);

carouselNavItems.forEach((item, index) => {
    item.addEventListener('click', () => {
        currentIndex = index;
        showSlide(currentIndex);
    });
});

// Auto-rotate carousel
setInterval(nextSlide, 5000);

// Wait for the page to load before applying the animation
window.addEventListener('load', () => {
    document.querySelectorAll('.fade-in-up').forEach(element => {
        element.classList.add('visible');
    });
});

// Image Viewer functionality
const imageViewer = document.getElementById('image-viewer');
const viewerImage = document.getElementById('viewer-image');
const closeBtn = document.getElementById('close-btn');

document.querySelectorAll('.clickable').forEach(image => {
    image.addEventListener('click', () => {
        viewerImage.src = image.src;
        imageViewer.classList.remove('hidden');
    });
});

closeBtn.addEventListener('click', () => {
    imageViewer.classList.add('hidden');
});
