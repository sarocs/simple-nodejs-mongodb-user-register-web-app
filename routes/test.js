const request = require('supertest');
const express = require('express');

// 1. Mock Multer before requiring the router so it intercepts the middleware setup
jest.mock('multer', () => {
    const multer = () => ({
        single: () => (req, res, next) => {
            // Simulate a successful file upload payload
            req.file = { filename: 'mock_upload_123.png' };
            return next();
        }
    });
    multer.diskStorage = jest.fn();
    return multer;
});

// 2. Mock the Mongoose User Model
const User = require('../models/users');
jest.mock('../models/users');

// Require the router after mocks are established
const router = require('./routes'); 

describe('POST /add Route Handler', () => {
    let app;

    beforeEach(() => {
        // Clear all mocks before each test to ensure isolation
        jest.clearAllMocks();

        // Setup a dummy Express app to test the router
        app = express();
        
        // Middleware to parse urlencoded bodies (form data)
        app.use(express.urlencoded({ extended: false }));
        app.use(express.json());

        // Middleware to mock express-session
        app.use((req, res, next) => {
            req.session = {}; 
            next();
        });

        // Mount the router
        app.use('/', router);
    });

    test('Success Scenario: Should create a new user and redirect to home', async () => {
        // Arrange: Mock the save function to resolve successfully
        const saveMock = jest.fn().mockResolvedValue(true);
        User.mockImplementation(() => ({
            save: saveMock
        }));

        const newUserData = {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '555-1234'
        };

        // Act: Send a POST request to the route
        const response = await request(app)
            .post('/add')
            .send(newUserData);

        // Assert: Verify database interaction and HTTP response
        expect(User).toHaveBeenCalledWith({
            name: 'John Doe',
            email: 'john@example.com',
            phone: '555-1234',
            image: 'mock_upload_123.png' // Verifying Multer mock worked
        });
        expect(saveMock).toHaveBeenCalled();
        expect(response.status).toBe(302); // 302 Found (Redirect)
        expect(response.header.location).toBe('/');
    });

    test('Edge Case: Should handle missing file upload by using default image', async () => {
        // Arrange: Override the multer mock temporarily for this test to simulate no file
        jest.mock('multer', () => {
            const multer = () => ({
                single: () => (req, res, next) => {
                    req.file = undefined; // No file uploaded
                    return next();
                }
            });
            multer.diskStorage = jest.fn();
            return multer;
        });

        // Re-require to apply the temporary mock (Note: in a real complex suite, 
        // you might handle this differently, but this works for isolation)
        jest.resetModules(); 
        const UserMock = require('../models/users');
        jest.mock('../models/users');
        const saveMock = jest.fn().mockResolvedValue(true);
        UserMock.mockImplementation(() => ({ save: saveMock }));
        
        const tempRouter = require('./routes');
        const tempApp = express();
        tempApp.use(express.urlencoded({ extended: false }));
        tempApp.use((req, res, next) => { req.session = {}; next(); });
        tempApp.use('/', tempRouter);

        // Act
        const response = await request(tempApp)
            .post('/add')
            .send({ name: 'Jane Doe' });

        // Assert: Verify fallback image was used
        expect(UserMock).toHaveBeenCalledWith(expect.objectContaining({
            image: 'user_unknown.png' 
        }));
        expect(response.status).toBe(302);
    });

    test('Error Scenario: Should handle database save failures gracefully', async () => {
        // Arrange: Mock the save function to throw an error
        const saveMock = jest.fn().mockRejectedValue(new Error('Database connection lost'));
        User.mockImplementation(() => ({
            save: saveMock
        }));

        // Act
        const response = await request(app)
            .post('/add')
            .send({ name: 'Error User' });

        // Assert: Verify it still redirects but caught the error
        expect(saveMock).toHaveBeenCalled();
        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/');
        // In a real scenario, you could also assert that req.session.message was set to 'danger',
        // but since we mocked the session loosely, checking the redirect is the primary UI outcome.
    });
});